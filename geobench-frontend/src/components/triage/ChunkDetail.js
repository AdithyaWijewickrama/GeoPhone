import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { mergeEvents, formatDateTime, formatDuration } from '../../utils';
import { DEFAULT_THRESHOLD, API_BASE_URL } from './constants';
import WaveformChart from './WaveformChart';
import FlaggedEventsTable from './FlaggedEventsTable';
import LabelEventModal from './LabelEventModal';
import SpectrogramModal from './SpectrogramModal';

export default function ChunkDetail({
    chunk,
    labels = {},
    onSaveLabel,
    setLabels,
    currentLocation,
    onRefreshKnownEvents
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
    const handleViewPlot = async (target) => {
        const startMs = target?.startTime ?? target?.start_time ?? target?.event_start ?? chunk?.startTime;
        const endMs = target?.endTime ?? target?.end_time ?? target?.event_end ?? chunk?.endTime;
        const title = target?.title || (startMs && endMs ? `${formatDateTime(startMs)} – ${formatDateTime(endMs)}` : 'Event Plot');

        setPlotModal({ visible: true, loading: true, image: null, error: null, title });

        try {
            const payload = {
                times: chunk.raw.times,
                volts: chunk.raw.volts,
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

    const handleBatchSaveFromModal = async ({ finalLabel, note, saveAsKnown, bounds: savedBounds }) => {
        for (const ev of savedBounds.events) {
            await onSaveLabel(chunk.key, chunk.name, ev, finalLabel, note, false);
        }

        if (saveAsKnown) {
            try {
                await fetch(`${API_BASE_URL}/api/known-events/`, {
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
                if (onRefreshKnownEvents) {
                    await onRefreshKnownEvents();
                }
            } catch (err) {
                console.error("Error creating known event rule from label:", err);
            }
        }

        setShowLabelModal(false);
        setSelectedTableEvents(new Set());
    };

    return (
        <div>
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
                currentLocation={currentLocation}
                onSave={handleBatchSaveFromModal}
            />

            {/* Spectrogram / Zoom Modal */}
            <SpectrogramModal
                plotModal={plotModal}
                onClose={() => setPlotModal(prev => ({ ...prev, visible: false }))}
            />
        </div>
    );
}
