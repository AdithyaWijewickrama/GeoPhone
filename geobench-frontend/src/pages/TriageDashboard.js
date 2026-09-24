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
import ChunksList from '../components/triage/ChunksList';
import DefineEventModal from '../components/triage/DefineEventModal';
import ChunkDetail from '../components/triage/ChunkDetail';

export default function TriageDashboard({
    rawFiles, setRawFiles,
    chunks, setChunks,
    selectedKey, setSelectedKey,
    labels, setLabels,
    intervalMins, setIntervalMins,
    currentLocation,
    locations,
    onOpenLocationModal,
    onLocationCreated,
    onSelectLocation
}) {
    const { user } = useAuth();
    const [scanning, setScanning] = useState(false);
    const [knownEvents, setKnownEvents] = useState([]);

    // List 1 (Raw Files) state
    const [showList1, setShowList1] = useState(true);
    const [selectedRawIndices, setSelectedRawIndices] = useState(new Set());

    // List 2 (Chunks) multi-select state
    const [selectedChunkKeys, setSelectedChunkKeys] = useState(new Set());

    // Active Chunk (loaded in detail panel)
    const [activeChunkData, setActiveChunkData] = useState(null);
    const [analyzingSelection, setAnalyzingSelection] = useState(false);

    // Define Event Modal State
    const [showDefineModal, setShowDefineModal] = useState(false);

    // File input refs
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);

    // Drag-to-select tracking states
    const [isDraggingRaw, setIsDraggingRaw] = useState(false);
    const [dragRawStart, setDragRawStart] = useState(null);
    const [dragRawDeselect, setDragRawDeselect] = useState(false);

    const [isDraggingChunks, setIsDraggingChunks] = useState(false);
    const [dragChunkStart, setDragChunkStart] = useState(null);
    const [dragChunkDeselect, setDragChunkDeselect] = useState(false);

    // Stop drag globally on window mouseup
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDraggingRaw(false);
            setDragRawStart(null);
            setDragRawDeselect(false);
            setIsDraggingChunks(false);
            setDragChunkStart(null);
            setDragChunkDeselect(false);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    // Fetch known events when location changes
    const fetchKnownEvents = useCallback(async () => {
        try {
            const locParam = currentLocation ? `?location_id=${currentLocation.id}` : '';
            const res = await fetch(`${API_BASE_URL}/api/known-events/${locParam}`);
            if (res.ok) {
                const data = await res.json();
                setKnownEvents(data);
                return data;
            }
        } catch (err) {
            console.error("Error fetching known events:", err);
        }
        return [];
    }, [currentLocation]);

    useEffect(() => {
        fetchKnownEvents();
    }, [fetchKnownEvents]);

    // Chunkise files based on known events and intervalMins
    const chunkiseFiles = useCallback((filesList, eventsList) => {
        if (!filesList || !filesList.length) {
            setChunks([]);
            return;
        }

        const events = eventsList || knownEvents;
        const standardGrouped = {};
        const eventGrouped = {};

        filesList.forEach(f => {
            const ms = getFileDateMs(f);
            const matchedEvent = events.find(ke => ms >= ke.start_time && ms <= ke.end_time);

            if (matchedEvent) {
                if (!eventGrouped[matchedEvent.id]) {
                    eventGrouped[matchedEvent.id] = { event: matchedEvent, files: [] };
                }
                eventGrouped[matchedEvent.id].files.push(f);
            } else {
                const chunkTime = ms - (ms % (intervalMins * 60 * 1000));
                if (!standardGrouped[chunkTime]) {
                    standardGrouped[chunkTime] = [];
                }
                standardGrouped[chunkTime].push(f);
            }
        });

        const standardChunks = Object.keys(standardGrouped).map(timeKey => {
            const dateStr = new Date(parseInt(timeKey)).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            return {
                key: `chunk_${timeKey}`,
                name: `${intervalMins}m Chunk: ${dateStr}`,
                timeMs: parseInt(timeKey),
                files: standardGrouped[timeKey].sort((a, b) => getFileDateMs(a) - getFileDateMs(b)),
                status: 'pending',
                isCustom: false
            };
        });

        const customChunks = Object.values(eventGrouped).map(group => {
            return {
                key: `custom_${group.event.id}`,
                name: `📌 Known: ${group.event.name}`,
                timeMs: group.event.start_time,
                files: group.files.sort((a, b) => getFileDateMs(a) - getFileDateMs(b)),
                status: 'pending',
                isCustom: true,
                eventData: group.event
            };
        });

        const allChunks = [...standardChunks, ...customChunks].sort((a, b) => a.timeMs - b.timeMs);
        setChunks(allChunks);
    }, [intervalMins, knownEvents, setChunks]);

    // Re-chunkise when rawFiles or interval changes
    useEffect(() => {
        if (rawFiles.length > 0) {
            chunkiseFiles(rawFiles, knownEvents);
        }
    }, [rawFiles, intervalMins, knownEvents, chunkiseFiles]);

    // Handle importing files
    const handleFilesSelected = (e) => {
        const files = Array.from(e.target.files).filter(f => /\.csv$/i.test(f.name));
        if (!files.length) return;

        // If no location is set, ask the user
        if (!currentLocation && onOpenLocationModal) {
            onOpenLocationModal();
        }

        const sorted = [...files].sort((a, b) => getFileDateMs(a) - getFileDateMs(b));
        setRawFiles(sorted);
        setSelectedRawIndices(new Set());
        setSelectedChunkKeys(new Set());
        setActiveChunkData(null);
        e.target.value = '';
    };

    // Scan a single chunk or batch of files
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

    const scanChunk = async (chunk) => {
        const result = await scanFilesAsChunk(chunk.files, chunk.name);
        if (result) {
            return { ...chunk, ...result, key: chunk.key };
        }
        return chunk;
    };

    const runFullScan = async () => {
        const pending = chunks.filter(c => c.status === 'pending');
        if (!pending.length) return;
        setScanning(true);
        for (let i = 0; i < pending.length; i++) {
            setChunks(prev => prev.map(c => c.key === pending[i].key ? { ...c, status: 'processing' } : c));
            const updated = await scanChunk(pending[i]);
            setChunks(prev => prev.map(c => c.key === pending[i].key ? updated : c));
        }
        setScanning(false);
    };

    // Selection info for List 1
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

    // Selection info for List 2
    const getChunkSelectionInfo = () => {
        if (!selectedChunkKeys.size) return null;
        const selectedList = chunks.filter(c => selectedChunkKeys.has(c.key));
        if (!selectedList.length) return null;

        const allFiles = selectedList.flatMap(c => c.files);
        if (!allFiles.length) return null;

        const times = allFiles.map(f => getFileDateMs(f));
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const durationSec = Math.max(1, Math.round((maxTime - minTime) / 1000) || (allFiles.length * 10));
        const dtStr = `${formatDateTime(minTime)} - ${formatDateTime(maxTime)}`;

        return {
            chunks: selectedList,
            chunkCount: selectedList.length,
            files: allFiles,
            fileCount: allFiles.length,
            durationSec,
            dtStr,
            minTime,
            maxTime
        };
    };

    const chunkSelectionInfo = getChunkSelectionInfo();

    // Analyze selection handlers
    const handleAnalyzeRawSelection = async () => {
        if (!rawSelectionInfo) return;
        setAnalyzingSelection(true);

        const customName = `Custom Selection: ${rawSelectionInfo.dtStr} (${rawSelectionInfo.count} files, ${rawSelectionInfo.durationSec}s)`;
        const scanned = await scanFilesAsChunk(rawSelectionInfo.files, customName);

        setActiveChunkData(scanned);
        setSelectedKey(scanned?.key || null);
        setAnalyzingSelection(false);
    };

    const handleAnalyzeChunkSelection = async () => {
        if (!chunkSelectionInfo) return;
        setAnalyzingSelection(true);

        if (chunkSelectionInfo.chunkCount === 1) {
            const single = chunkSelectionInfo.chunks[0];
            const updated = await scanChunk(single);
            setChunks(prev => prev.map(c => c.key === updated.key ? updated : c));
            setActiveChunkData(updated);
            setSelectedKey(updated.key);
        } else {
            // Multiple chunks selected -> Batch into single combined chunk
            const batchName = `Batch of ${chunkSelectionInfo.chunkCount} Chunks: ${chunkSelectionInfo.dtStr}`;
            const scanned = await scanFilesAsChunk(chunkSelectionInfo.files, batchName);
            setActiveChunkData(scanned);
            setSelectedKey(scanned?.key || null);
        }
        setAnalyzingSelection(false);
    };

    // Save label callback
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
            const updatedEvents = await fetchKnownEvents();
            if (rawFiles.length > 0) {
                chunkiseFiles(rawFiles, updatedEvents);
            }
        }
    };

    const handleClearAll = () => {
        setRawFiles([]);
        setChunks([]);
        setSelectedRawIndices(new Set());
        setSelectedChunkKeys(new Set());
        setActiveChunkData(null);
    };

    const handleEventCreated = async () => {
        const updatedEvents = await fetchKnownEvents();
        if (rawFiles.length > 0) {
            chunkiseFiles(rawFiles, updatedEvents);
        }
    };

    return (
        <div className="bg-dark text-light min-vh-100 d-flex flex-column font-monospace">
            {/* Header / Toolbar */}
            <TriageHeader
                currentLocation={currentLocation}
                user={user}
                intervalMins={intervalMins}
                setIntervalMins={setIntervalMins}
                onOpenLocationModal={onOpenLocationModal}
                onOpenDefineModal={() => setShowDefineModal(true)}
                onFilesSelected={handleFilesSelected}
                fileInputRef={fileInputRef}
                folderInputRef={folderInputRef}
                onScanAll={runFullScan}
                scanning={scanning}
                chunkCount={chunks.length}
                onClear={handleClearAll}
            />

            {/* Main Content Layout */}
            <div className="container-fluid flex-grow-1 d-flex p-0">
                <div className="row g-0 w-100">
                    {/* Sidebar: List 1 (Raw Files) and List 2 (Chunks) */}
                    <div className="col-md-4 col-lg-3 border-end border-secondary bg-dark d-flex flex-column" style={{ maxHeight: 'calc(100vh - 75px)' }}>
                        {/* List 1: Raw Files Panel */}
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
                        />

                        {/* List 2: Chunks List Panel */}
                        <ChunksList
                            chunks={chunks}
                            selectedChunkKeys={selectedChunkKeys}
                            setSelectedChunkKeys={setSelectedChunkKeys}
                            activeChunkData={activeChunkData}
                            chunkSelectionInfo={chunkSelectionInfo}
                            analyzingSelection={analyzingSelection}
                            onAnalyzeChunkSelection={handleAnalyzeChunkSelection}
                            isDraggingChunks={isDraggingChunks}
                            setIsDraggingChunks={setIsDraggingChunks}
                            dragChunkStart={dragChunkStart}
                            setDragChunkStart={setDragChunkStart}
                            dragChunkDeselect={dragChunkDeselect}
                            setDragChunkDeselect={setDragChunkDeselect}
                        />
                    </div>

                    {/* Detail Panel: Waveform & Flagged Events */}
                    <div className="col-md-8 col-lg-9 p-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 75px)' }}>
                        {!activeChunkData ? (
                            <div className="text-center text-muted mt-5 py-5">
                                <h3>No chunk or files selected</h3>
                                <p>Select files from List 1 or chunks from List 2 and click Analyze.</p>
                            </div>
                        ) : activeChunkData.status === 'pending' || activeChunkData.status === 'processing' ? (
                            <div className="text-center mt-5 py-5">
                                <h4 className={activeChunkData.isCustom ? "text-info" : "text-muted"}>
                                    {activeChunkData.name} Ready for Analysis
                                </h4>
                                <button
                                    className="btn btn-warning fw-bold mt-3 px-4 py-2"
                                    disabled={activeChunkData.status === 'processing' || analyzingSelection}
                                    onClick={() => handleAnalyzeChunkSelection()}
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

            {/* Define Known Event Modal */}
            <DefineEventModal
                show={showDefineModal}
                onClose={() => setShowDefineModal(false)}
                currentLocation={currentLocation}
                locations={locations}
                onOpenLocationModal={onOpenLocationModal}
                user={user}
                onEventCreated={handleEventCreated}
            />
        </div>
    );
}
