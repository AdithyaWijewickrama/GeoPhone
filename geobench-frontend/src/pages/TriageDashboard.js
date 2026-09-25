import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    formatDateTime,
    mergeEvents,
    getFileDateMs
} from '../utils';
import { DEFAULT_THRESHOLD, API_BASE_URL } from '../components/triage/constants';
import TriageHeader from '../components/triage/TriageHeader';
import RawFilesList from '../components/triage/RawFilesList';
import KnownEventsList from '../components/triage/KnownEventsList';
import DefineEventModal from '../components/triage/DefineEventModal';
import ChunkDetail from '../components/triage/ChunkDetail';

/**
 * Coordinates raw file selection, chunk scanning, event labeling, known events, and triage display state.
 */
export default function TriageDashboard({
    rawFiles = [],
    setRawFiles,
    selectedKey,
    setSelectedKey,
    labels = {},
    setLabels,
    currentLocation,
    locations = [],
    onOpenLocationModal,
    onLocationCreated,
    onSelectLocation
}) {
    const { user } = useAuth();
    const [scanning, setScanning] = useState(false);
    const [knownEvents, setKnownEvents] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    // List 1 (Raw Files) state
    const [showList1, setShowList1] = useState(true);
    const [selectedRawIndices, setSelectedRawIndices] = useState(new Set());
    const [activeDay, setActiveDay] = useState(null);
    const [activeHour, setActiveHour] = useState(null);
    const [activeMinute, setActiveMinute] = useState(null);

    // List 2 (Known Events) state
    const [selectedKnownEventId, setSelectedKnownEventId] = useState(null);

    // Active Dataset loaded in detail panel
    const [activeChunkData, setActiveChunkData] = useState(null);
    const [analyzingSelection, setAnalyzingSelection] = useState(false);

    // Define/Edit Event Modal State
    const [showDefineModal, setShowDefineModal] = useState(false);
    const [eventToEdit, setEventToEdit] = useState(null);

    // File input refs
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);

    // Drag-to-select tracking states
    const [isDraggingRaw, setIsDraggingRaw] = useState(false);
    const [dragRawStart, setDragRawStart] = useState(null);
    const [dragRawDeselect, setDragRawDeselect] = useState(false);

    // Stop drag globally on window mouseup
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDraggingRaw(false);
            setDragRawStart(null);
            setDragRawDeselect(false);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    // Fetch known events from database when location changes
    /**
     * Loads known events, filtered to the active location where applicable.
     */
    const fetchKnownEvents = useCallback(async () => {
        setLoadingEvents(true);
        try {
            const locParam = currentLocation ? `?location_id=${currentLocation.id}` : '';
            const res = await fetch(`${API_BASE_URL}/api/known-events/${locParam}`);
            if (res.ok) {
                const data = await res.json();
                setKnownEvents(data);
                setLoadingEvents(false);
                return data;
            }
        } catch (err) {
            console.error("Error fetching known events:", err);
        }
        setLoadingEvents(false);
        return [];
    }, [currentLocation]);

    useEffect(() => {
        fetchKnownEvents();
    }, [fetchKnownEvents]);

    // Handle importing files
    /**
     * Filters selected files to CSV, sorts them by inferred timestamp, and initializes raw-file state.
     */
    const handleFilesSelected = (e) => {
        const files = Array.from(e.target.files).filter(f => /\.csv$/i.test(f.name));
        if (!files.length) return;

        if (!currentLocation && onOpenLocationModal) {
            onOpenLocationModal();
        }

        const sorted = [...files].sort((a, b) => getFileDateMs(a) - getFileDateMs(b));
        setRawFiles(sorted);
        setSelectedRawIndices(new Set());
        setActiveChunkData(null);
        e.target.value = '';

        // Check database and update known events when loading files
        fetchKnownEvents();
    };

    /**
     * Opens the known-event form for creation or editing.
     */
    const handleOpenDefineModal = (ev = null) => {
        setEventToEdit(ev);
        setShowDefineModal(true);
    };

    /**
     * Closes and resets the known-event form.
     */
    const handleCloseDefineModal = () => {
        setShowDefineModal(false);
        setEventToEdit(null);
    };

    /**
     * Deletes a known event and refreshes related state.
     */
    const handleDeleteKnownEvent = async (ev) => {
        if (!ev || !ev.id) return;
        if (!window.confirm(`Are you sure you want to delete known event "${ev.name}"?`)) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/known-events/${ev.id}/`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(data.error || "Failed to delete event");
                return;
            }
            if (selectedKnownEventId === ev.id) {
                setSelectedKnownEventId(null);
            }
            await fetchKnownEvents();
        } catch (err) {
            console.error("Error deleting event:", err);
            alert("Error connecting to server.");
        }
    };

    // Scan a batch of files as a single continuous time dataset
    /**
     * Uploads selected files for chunk analysis and maps returned data/labels into dashboard state.
     */
    const scanFilesAsChunk = async (filesToScan, customName) => {
        if (!filesToScan || !filesToScan.length) return null;

        const formData = new FormData();
        filesToScan.forEach(f => formData.append('files', f));
        if (currentLocation) {
            formData.append('location_id', currentLocation.id);
        }
        if (user) {
            formData.append('user_id', user.id);
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/process-chunk/`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (!data.ok) {
                return {
                    key: `err_${Date.now()}`,
                    name: customName,
                    files: filesToScan,
                    status: 'corrupted',
                    missing_reports: data.missing || [data.error]
                };
            }

            if (data.existing_labels) {
                setLabels(prev => ({ ...prev, ...data.existing_labels }));
            }

            const events = mergeEvents(data.blocks, DEFAULT_THRESHOLD);
            return {
                key: `scanned_${Date.now()}`,
                name: customName,
                files: filesToScan,
                status: events.length ? 'flagged' : 'clean',
                sampleCount: data.sampleCount,
                startTime: data.startTime,
                endTime: data.endTime,
                missing_reports: data.missing_reports,
                anomalyCount: events.length,
                events: events,
                raw: data
            };
        } catch (err) {
            return {
                key: `err_${Date.now()}`,
                name: customName,
                files: filesToScan,
                status: 'corrupted',
                missing_reports: ['Network/Server Error']
            };
        }
    };

    // Scan All Files
    /**
     * Scans the complete loaded raw-file set as one chunk.
     */
    const runFullScan = async () => {
        if (!rawFiles || !rawFiles.length) return;
        setScanning(true);
        const name = `Full Dataset (${rawFiles.length} files)`;
        const scanned = await scanFilesAsChunk(rawFiles, name);
        setActiveChunkData(scanned);
        if (setSelectedKey && scanned?.key) {
            setSelectedKey(scanned.key);
        }
        setScanning(false);
    };

    // Selection info for List 1
    /**
     * Summarizes currently selected files, including count, time range, and duration.
     */
    const getRawSelectionInfo = () => {
        if (!selectedRawIndices.size) return null;
        const selectedFiles = Array.from(selectedRawIndices).map(i => rawFiles[i]).filter(Boolean);
        if (!selectedFiles.length) return null;

        const times = selectedFiles.map(f => getFileDateMs(f));
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const durationSec = Math.max(1, Math.round((maxTime - minTime) / 1000) || (selectedFiles.length * 10));
        const dtStr = `${formatDateTime(minTime)} - ${formatDateTime(maxTime)}`;

        return {
            files: selectedFiles,
            count: selectedFiles.length,
            durationSec,
            dtStr,
            minTime,
            maxTime
        };
    };

    const rawSelectionInfo = getRawSelectionInfo();

    // Analyze selection from List 1
    /**
     * Scans only the currently selected raw files.
     */
    const handleAnalyzeRawSelection = async () => {
        if (!rawSelectionInfo) return;
        setAnalyzingSelection(true);

        const customName = `Custom Selection: ${rawSelectionInfo.dtStr} (${rawSelectionInfo.count} files, ${rawSelectionInfo.durationSec}s)`;
        const scanned = await scanFilesAsChunk(rawSelectionInfo.files, customName);

        setActiveChunkData(scanned);
        if (setSelectedKey && scanned?.key) {
            setSelectedKey(scanned.key);
        }
        setAnalyzingSelection(false);
    };

    // When a Known Event is clicked in List 2:
    // Selects the day, hour, and minute in List 1, highlights matching files, and analyzes them
    /**
     * Selects files around a known event's time interval and scans them.
     */
    const handleSelectKnownEvent = async (event) => {
        if (!event) return;
        setSelectedKnownEventId(event.id);

        const startMs = event.start_time || event.startTime || 0;
        const endMs = event.end_time || event.endTime || (startMs + 10000);
        const d = new Date(startMs);
        const year = d.getFullYear() < 2000 ? 2026 : d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dayKey = `${year}-${month}-${day}`;
        const hour = String(d.getHours()).padStart(2, '0');
        const hourKey = `${hour}:00`;
        const min = String(d.getMinutes()).padStart(2, '0');
        const minKey = `${hour}:${min}`;

        // Select time & date in List 1
        setActiveDay(dayKey);
        setActiveHour(hourKey);
        setActiveMinute(minKey);

        // Find matching files in rawFiles
        const matchingIndices = new Set();
        rawFiles.forEach((file, idx) => {
            const fileMs = getFileDateMs(file);
            if (fileMs >= (startMs - 60000) && fileMs <= (endMs + 60000)) {
                matchingIndices.add(idx);
            }
        });

        if (matchingIndices.size > 0) {
            setSelectedRawIndices(matchingIndices);
            const selectedFiles = Array.from(matchingIndices).map(i => rawFiles[i]);
            setAnalyzingSelection(true);
            const customName = `📌 Known Event: ${event.name} (${formatDateTime(startMs)})`;
            const scanned = await scanFilesAsChunk(selectedFiles, customName);
            setActiveChunkData(scanned);
            if (setSelectedKey && scanned?.key) {
                setSelectedKey(scanned.key);
            }
            setAnalyzingSelection(false);
        } else {
            setSelectedRawIndices(new Set());
        }
    };

    // Save label callback
    /**
     * Saves or clears an event label and optionally creates a known event.
     */
    const handleSaveLabel = async (chunkKey, chunkName, event, label, note, saveAsKnownEvent = false) => {
        const labelKey = `${chunkName}_${Math.round(event.startTime)}_${Math.round(event.endTime)}`;

        setLabels(prev => {
            const newLabels = { ...prev };
            if (!label && !note) delete newLabels[labelKey];
            else newLabels[labelKey] = { label, note };
            return newLabels;
        });

        await fetch(`${API_BASE_URL}/api/save-label/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file: chunkName,
                startTime: event.startTime,
                endTime: event.endTime,
                duration: (event.endTime - event.startTime) / 1000,
                peakScore: event.peakScore,
                label,
                note,
                location_id: currentLocation ? currentLocation.id : null,
                save_as_known_event: saveAsKnownEvent,
                user_id: user ? user.id : null
            })
        });

        if (saveAsKnownEvent) {
            await fetchKnownEvents();
        }
    };

    /**
     * Clears loaded/scanned chunk and selection state.
     */
    const handleClearAll = () => {
        setRawFiles([]);
        setSelectedRawIndices(new Set());
        setActiveChunkData(null);
    };

    /**
     * Refreshes known events after creation or editing.
     */
    const handleEventCreated = async () => {
        await fetchKnownEvents();
    };

    return (
        <div className="bg-dark text-light min-vh-100 d-flex flex-column font-monospace">
            {/* Header / Toolbar */}
            <TriageHeader
                currentLocation={currentLocation}
                user={user}
                onOpenLocationModal={onOpenLocationModal}
                onOpenDefineModal={() => handleOpenDefineModal(null)}
                onFilesSelected={handleFilesSelected}
                fileInputRef={fileInputRef}
                folderInputRef={folderInputRef}
                onScanAll={runFullScan}
                scanning={scanning}
                fileCount={rawFiles.length}
                onClear={handleClearAll}
            />

            {/* Main Content Layout */}
            <div className="container-fluid flex-grow-1 d-flex p-0">
                <div className="row g-0 w-100">
                    {/* Sidebar: List 1 (Raw Files) and List 2 (Known Events) */}
                    <div className="col-md-5 col-lg-4 border-end border-secondary bg-dark d-flex flex-column" style={{ maxHeight: 'calc(100vh - 75px)', overflowY: 'auto' }}>
                        {/* List 1: Raw Files Panel with Days, Hours, and Minutes */}
                        <RawFilesList
                            rawFiles={rawFiles}
                            showList1={showList1}
                            setShowList1={setShowList1}
                            selectedRawIndices={selectedRawIndices}
                            setSelectedRawIndices={setSelectedRawIndices}
                            rawSelectionInfo={rawSelectionInfo}
                            analyzingSelection={analyzingSelection}
                            onAnalyzeRawSelection={handleAnalyzeRawSelection}
                            isDraggingRaw={isDraggingRaw}
                            setIsDraggingRaw={setIsDraggingRaw}
                            dragRawStart={dragRawStart}
                            setDragRawStart={setDragRawStart}
                            dragRawDeselect={dragRawDeselect}
                            setDragRawDeselect={setDragRawDeselect}
                            knownEvents={knownEvents}
                            activeDay={activeDay}
                            setActiveDay={setActiveDay}
                            activeHour={activeHour}
                            setActiveHour={setActiveHour}
                            activeMinute={activeMinute}
                            setActiveMinute={setActiveMinute}
                        />

                        {/* List 2: Known Events Panel */}
                        <KnownEventsList
                            knownEvents={knownEvents}
                            selectedKnownEventId={selectedKnownEventId}
                            onSelectKnownEvent={handleSelectKnownEvent}
                            onOpenDefineEventModal={() => handleOpenDefineModal(null)}
                            onEditKnownEvent={handleOpenDefineModal}
                            onDeleteKnownEvent={handleDeleteKnownEvent}
                            onRefreshKnownEvents={fetchKnownEvents}
                            rawFiles={rawFiles}
                            loading={loadingEvents}
                        />
                    </div>

                    {/* Detail Panel: Waveform & Flagged Events */}
                    <div className="col-md-7 col-lg-8 p-3 overflow-auto" style={{ maxHeight: 'calc(100vh - 75px)' }}>
                        {!activeChunkData ? (
                            <div className="text-center text-muted mt-5 py-5">
                                <h3>No dataset or files selected</h3>
                                <p className="lead">
                                    Select files from <strong>List 1</strong> or click a known event from <strong>List 2</strong> to inspect and analyze the signal waveform.
                                </p>
                                {rawFiles.length > 0 && (
                                    <button
                                        className="btn btn-warning fw-bold px-4 py-2 mt-2"
                                        onClick={runFullScan}
                                    >
                                        ⚡ Analyze All {rawFiles.length} Loaded Files
                                    </button>
                                )}
                            </div>
                        ) : activeChunkData.status === 'pending' || activeChunkData.status === 'processing' ? (
                            <div className="text-center mt-5 py-5">
                                <h4 className="text-info">
                                    {activeChunkData.name} Ready for Analysis
                                </h4>
                                <button
                                    className="btn btn-warning fw-bold mt-3 px-4 py-2"
                                    disabled={activeChunkData.status === 'processing' || analyzingSelection}
                                    onClick={handleAnalyzeRawSelection}
                                >
                                    {activeChunkData.status === 'processing' || analyzingSelection ? 'Processing...' : `Analyze ${activeChunkData.name}`}
                                </button>
                            </div>
                        ) : (
                            <ChunkDetail
                                key={activeChunkData.key || activeChunkData.name || 'active-chunk'}
                                chunk={activeChunkData}
                                labels={labels}
                                onSaveLabel={handleSaveLabel}
                                setLabels={setLabels}
                                currentLocation={currentLocation}
                                onRefreshKnownEvents={handleEventCreated}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Define / Edit Known Event Modal */}
            <DefineEventModal
                show={showDefineModal}
                onClose={handleCloseDefineModal}
                currentLocation={currentLocation}
                locations={locations}
                onOpenLocationModal={onOpenLocationModal}
                user={user}
                onEventCreated={handleEventCreated}
                eventToEdit={eventToEdit}
                onDeleteEvent={handleDeleteKnownEvent}
            />
        </div>
    );
}
