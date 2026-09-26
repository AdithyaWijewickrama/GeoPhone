import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { mergeEvents, formatDateTime, formatDuration, getWaveformWindow } from '../../utils';
import { DEFAULT_THRESHOLD, API_BASE_URL } from './constants';
import WaveformChart from './WaveformChart';
import FlaggedEventsTable from './FlaggedEventsTable';
import LabelEventModal from './LabelEventModal';
import SpectrogramModal from './SpectrogramModal';

const MAX_PLOT_SAMPLES = 20000;

const getPlotSampleWindow = (times, volts, startMs, endMs) => {
    const count = Math.min(times?.length || 0, volts?.length || 0);
    if (!count) return { times: [], volts: [] };

    const firstTimestamp = Number(times[0]);
    const isMilliseconds = firstTimestamp >= 1e11;
    const isEpochSeconds = firstTimestamp >= 1e8 && firstTimestamp < 1e11;
    let firstIndex = 0;
    let endIndex = count;

    if ((isMilliseconds || isEpochSeconds) && Number.isFinite(Number(startMs)) && Number.isFinite(Number(endMs))) {
        const unitScale = isMilliseconds ? 1 : 0.001;
        const start = Number(startMs) * unitScale;
        const end = Number(endMs) * unitScale;
        if (end >= start) {
            const padding = Math.max(isMilliseconds ? 1000 : 1, (end - start) * 0.1);
            const lower = start - padding;
            const upper = end + padding;
            let low = 0;
            let high = count;
            while (low < high) {
                const mid = (low + high) >> 1;
                if (Number(times[mid]) < lower) low = mid + 1;
                else high = mid;
            }
            firstIndex = low;
            low = firstIndex;
            high = count;
            while (low < high) {
                const mid = (low + high) >> 1;
                if (Number(times[mid]) <= upper) low = mid + 1;
                else high = mid;
            }
            endIndex = low;
            if (firstIndex >= endIndex) {
                firstIndex = 0;
                endIndex = count;
            }
        }
    }

    const windowCount = endIndex - firstIndex;
    const stride = Math.max(1, Math.ceil(windowCount / MAX_PLOT_SAMPLES));
    const plotTimes = [];
    const plotVolts = [];
    for (let index = firstIndex; index < endIndex; index += stride) {
        plotTimes.push(Number(times[index]));
        plotVolts.push(Number(volts[index]));
    }
    const lastIndex = endIndex - 1;
    if (lastIndex >= firstIndex && (lastIndex - firstIndex) % stride !== 0) {
        plotTimes.push(Number(times[lastIndex]));
        plotVolts.push(Number(volts[lastIndex]));
    }
    return { times: plotTimes, volts: plotVolts };
};

/**
 * Displays analysis for a selected chunk, including its waveform and detected events.
 */
export default function ChunkDetail({
    chunk,
    labels = {},
    onSaveLabel,
    onSaveLabelsBatch,
    setLabels,
    currentLocation,
    onRefreshKnownEvents,
    knownEvent = null
}) {
    const { user } = useAuth();
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

    const [plotModal, setPlotModal] = useState({ visible: false, loading: false, image: null, error: null, title: '' });

    // Dynamic waveform selection window state
    const [waveformSelection, setWaveformSelection] = useState(null);

    // Table multi-selection state with effortless drag
    const [selectedTableEvents, setSelectedTableEvents] = useState(new Set());
    const [isDraggingTable, setIsDraggingTable] = useState(false);
    const [dragTableStart, setDragTableStart] = useState(null);
    const [dragTableDeselect, setDragTableDeselect] = useState(false);

    // Reset table selection whenever active chunk or raw data changes
    useEffect(() => {
        setSelectedTableEvents(new Set());
    }, [chunk?.key, chunk?.raw]);

    // Label Event Popup Modal State
    const [showLabelModal, setShowLabelModal] = useState(false);

    // Stop drag globally on window mouseup
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDraggingTable(false);
            setDragTableStart(null);
            setDragTableDeselect(false);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    const allChunkEvents = useMemo(() => {
        if (!chunk?.raw?.blocks) return [];
        return mergeEvents(chunk.raw.blocks, threshold);
    }, [chunk?.raw?.blocks, threshold]);

    // Filter events based on active visible waveform window
    const currentEvents = useMemo(() => {
        if (!waveformSelection || !waveformSelection.isZoomed) {
            return allChunkEvents;
        }
        return allChunkEvents.filter(ev => {
            return Math.max(ev.startTime, waveformSelection.startMs) <= Math.min(ev.endTime, waveformSelection.endMs);
        });
    }, [allChunkEvents, waveformSelection]);

    // Handle visible range change from WaveformChart
    /**
     * Updates the selected/zoomed waveform interval.
     */
    const handleWaveformSelectionChange = useCallback((sel) => {
        setWaveformSelection(sel);
    }, []);

    if (chunk?.status === 'corrupted' || !chunk?.raw) {
        return (
            <div className="alert alert-danger shadow-sm">
                <h5>Analysis Failed</h5>
                {chunk?.missing_reports && chunk.missing_reports.map((r, i) => <div key={i}>• {r}</div>)}
            </div>
        );
    }

    // Calculate fixed date & time for selected events
    /**
     * Returns the combined time bounds and event list for selected table events.
     */
    const getSelectedEventsBounds = () => {
        if (!selectedTableEvents.size) return null;
        const selectedList = Array.from(selectedTableEvents).map(i => currentEvents[i]).filter(Boolean);
        if (!selectedList.length) return null;

        const startTimes = selectedList.map(e => e.startTime);
        const endTimes = selectedList.map(e => e.endTime);
        const minStart = Math.min(...startTimes);
        const maxEnd = Math.max(...endTimes);
        const durationMs = maxEnd - minStart;

        return {
            events: selectedList,
            count: selectedList.length,
            minStart,
            maxEnd,
            durationMs,
            startFormatted: formatDateTime(minStart),
            endFormatted: formatDateTime(maxEnd),
            durationFormatted: formatDuration(durationMs)
        };
    };

    const bounds = getSelectedEventsBounds();

    // View spectrogram / Matplotlib zoom plot
    /**
     * Requests an event plot from the backend and displays the result or error.
     */
    const handleViewPlot = async (target) => {
        const startMs = target?.startTime ?? target?.start_time ?? target?.event_start ?? chunk?.startTime;
        const endMs = target?.endTime ?? target?.end_time ?? target?.event_end ?? chunk?.endTime;
        const plotSamples = getPlotSampleWindow(chunk.raw.times, chunk.raw.volts, startMs, endMs);
        const title = target?.title || (startMs && endMs ? `${formatDateTime(startMs)} – ${formatDateTime(endMs)}` : 'Event Plot');

        setPlotModal({ visible: true, loading: true, image: null, error: null, title });

        try {
            const payload = {
                times: plotSamples.times,
                volts: plotSamples.volts,
                start_time: startMs,
                end_time: endMs,
                event_start: startMs,
                event_end: endMs,
                chunk_name: chunk.name
            };

            const res = await fetch(`${API_BASE_URL}/api/plot-event/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setPlotModal({ visible: true, loading: false, image: null, error: data.error || 'Failed to render plot', title });
            } else {
                setPlotModal({ visible: true, loading: false, image: data.image_base64 || data.image, error: null, title });
            }
        } catch (err) {
            setPlotModal({ visible: true, loading: false, image: null, error: err.message || 'Network error generating plot', title });
        }
    };

    /**
     * Applies a label/note to selected events and optionally saves the interval as a known event.
     * Sends every selected event in ONE request (via onSaveLabelsBatch) instead of one
     * request per event, so a multi-select "Label Event (N)" save is a single round trip.
     */
    const handleBatchSaveFromModal = async ({ finalLabel, note, saveAsKnown, bounds: savedBounds }) => {
        const events = savedBounds.events.map(event => ({
            event,
            label: finalLabel,
            note,
            waveform: getWaveformWindow(chunk.raw.times, chunk.raw.volts, event.startTime, event.endTime)
        }));

        await onSaveLabelsBatch(chunk.name, events);

        if (saveAsKnown) {
            const response = await fetch(`${API_BASE_URL}/api/known-events/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: finalLabel,
                    start_time: savedBounds.minStart,
                    end_time: savedBounds.maxEnd,
                    location_id: currentLocation ? currentLocation.id : null,
                    note: note,
                    force: true,
                    user_id: user ? user.id : null
                })
            });
            const result = await response.json();
            if (!response.ok || result.error || result.status === 'collision_warning') {
                throw new Error(result.error || result.message || 'The known event could not be saved.');
            }
            if (onRefreshKnownEvents) {
                await onRefreshKnownEvents();
            }
        }

        setShowLabelModal(false);
        setSelectedTableEvents(new Set());
    };

    return (
        <div>
            {knownEvent && (
                <div className="card bg-dark border-warning shadow-sm mb-3" aria-label="Selected known event details">
                    <div className="card-body py-2 px-3">
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <div>
                                <span className="text-warning fw-bold me-2">📌 Known Event</span>
                                <span className="text-light fw-semibold">{knownEvent.event_type || knownEvent.name}</span>
                            </div>
                            <span className="badge bg-warning text-dark">
                                Trust {knownEvent.trust_score ?? 100}/100
                            </span>
                        </div>
                        <div className="d-flex flex-wrap gap-3 mt-1 small">
                            <span className="text-info">
                                {formatDateTime(knownEvent.start_time ?? knownEvent.startTime)}
                                {' – '}
                                {formatDateTime(
                                    knownEvent.end_time
                                    ?? knownEvent.endTime
                                    ?? ((knownEvent.start_time ?? knownEvent.startTime ?? 0) + 10000)
                                )}
                            </span>
                            {knownEvent.duration > 0 && (
                                <span className="text-warning">{formatDuration(knownEvent.duration * 1000)}</span>
                            )}
                            {knownEvent.distance_from_sensor_m != null && (
                                <span className="text-muted">{knownEvent.distance_from_sensor_m} m from sensor</span>
                            )}
                        </div>
                        {(knownEvent.description || knownEvent.note || knownEvent.notes) && (
                            <div className="text-muted small mt-1">
                                {knownEvent.description || knownEvent.note || knownEvent.notes}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Waveform and Anomaly Score Chart */}
            <WaveformChart
                chunk={chunk}
                threshold={threshold}
                setThreshold={setThreshold}
                onSelectionChange={handleWaveformSelectionChange}
                onViewPlot={handleViewPlot}
            />

            {/* Flagged Events Table */}
            <FlaggedEventsTable
                currentEvents={currentEvents}
                chunk={chunk}
                labels={labels}
                onSaveLabel={onSaveLabel}
                setLabels={setLabels}
                selectedTableEvents={selectedTableEvents}
                setSelectedTableEvents={setSelectedTableEvents}
                onOpenLabelModal={() => setShowLabelModal(true)}
                onViewPlot={handleViewPlot}
                isDraggingTable={isDraggingTable}
                setIsDraggingTable={setIsDraggingTable}
                dragTableStart={dragTableStart}
                setDragTableStart={setDragTableStart}
                dragTableDeselect={dragTableDeselect}
                setDragTableDeselect={setDragTableDeselect}
                isFilteredByWaveform={Boolean(waveformSelection?.isZoomed)}
                totalUnfilteredCount={allChunkEvents.length}
                onResetWaveformFilter={() => setWaveformSelection(null)}
            />

            {/* Label Event Modal */}
            <LabelEventModal
                show={showLabelModal}
                onClose={() => setShowLabelModal(false)}
                bounds={bounds}
                onSave={handleBatchSaveFromModal}
                waveform={chunk.raw}
            />

            {/* Spectrogram / Zoom Modal */}
            <SpectrogramModal
                plotModal={plotModal}
                onClose={() => setPlotModal(prev => ({ ...prev, visible: false }))}
            />
        </div>
    );
}