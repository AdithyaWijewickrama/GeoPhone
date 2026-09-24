import React, { useEffect, useRef, useState, useCallback } from 'react';
import Chart from 'chart.js/auto';
import {
    formatDuration,
    formatDateTime,
    toDatetimeLocalString,
    mergeEvents,
    getFileDateMs
} from '../utils';

const LABEL_OPTIONS = [
    '',
    'Footstep / foot traffic',
    'Vehicle',
    'Seismic event / tremor',
    'Wind / environmental',
    'Equipment / machinery',
    'Sensor artifact',
    'False positive',
    'Unknown'
];

const DEFAULT_THRESHOLD = 5;
const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

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
    const [scanning, setScanning] = useState(false);
    const [knownEvents, setKnownEvents] = useState([]);

    // List 1 (Raw Files) state
    const [showList1, setShowList1] = useState(true);
    const [selectedRawIndices, setSelectedRawIndices] = useState(new Set());
    const [rawPage, setRawPage] = useState(0);
    const ROWS_PER_PAGE = 1000;

    // List 2 (Chunks) multi-select state
    const [selectedChunkKeys, setSelectedChunkKeys] = useState(new Set());

    // Active Chunk (loaded in detail panel)
    const [activeChunkData, setActiveChunkData] = useState(null);
    const [analyzingSelection, setAnalyzingSelection] = useState(false);

    // Define Event Modal State
    const [showDefineModal, setShowDefineModal] = useState(false);
    const [defineEventLocationId, setDefineEventLocationId] = useState('');
    const [newEvent, setNewEvent] = useState({ name: '', start: '', end: '', duration: '', note: '' });
    const [defineCollisionWarning, setDefineCollisionWarning] = useState(null);
    const [forceDefineSave, setForceDefineSave] = useState(false);

    // File input refs
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);

    // Drag-to-select tracking states
    const [isDraggingRaw, setIsDraggingRaw] = useState(false);
    const [dragRawStart, setDragRawStart] = useState(null);

    const [isDraggingChunks, setIsDraggingChunks] = useState(false);
    const [dragChunkStart, setDragChunkStart] = useState(null);

    // Stop drag globally on window mouseup
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDraggingRaw(false);
            setDragRawStart(null);
            setIsDraggingChunks(false);
            setDragChunkStart(null);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    // Set default define event location when location changes
    useEffect(() => {
        if (currentLocation) {
            setDefineEventLocationId(String(currentLocation.id));
        }
    }, [currentLocation]);

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

    // --- Define Event Modal Two-Way Binding ---
    const handleStartChange = (e) => {
        const newStart = e.target.value;
        let updates = { start: newStart };

        if (newStart && newEvent.duration) {
            const endMs = new Date(newStart).getTime() + Number(newEvent.duration) * 1000;
            updates.end = toDatetimeLocalString(new Date(endMs));
        } else if (newStart && newEvent.end) {
            const dur = (new Date(newEvent.end).getTime() - new Date(newStart).getTime()) / 1000;
            updates.duration = dur >= 0 ? dur : '';
        }
        setNewEvent(prev => ({ ...prev, ...updates }));
    };

    const handleEndChange = (e) => {
        const newEnd = e.target.value;
        let updates = { end: newEnd };

        if (newEnd && newEvent.start) {
            const dur = (new Date(newEnd).getTime() - new Date(newEvent.start).getTime()) / 1000;
            updates.duration = dur >= 0 ? dur : '';
        }
        setNewEvent(prev => ({ ...prev, ...updates }));
    };

    const handleDurationChange = (e) => {
        const newDur = e.target.value;
        let updates = { duration: newDur };

        if (newDur && newEvent.start) {
            const endMs = new Date(newEvent.start).getTime() + Number(newDur) * 1000;
            updates.end = toDatetimeLocalString(new Date(endMs));
        }
        setNewEvent(prev => ({ ...prev, ...updates }));
    };

    // Create Known Event
    const handleCreateEvent = async (overrideForce = false) => {
        if (!newEvent.name.trim() || !newEvent.start || !newEvent.end) {
            return alert("Please fill in Event Name, Start Time, and End Time.");
        }

        const start_time = new Date(newEvent.start).getTime();
        const end_time = new Date(newEvent.end).getTime();

        if (end_time <= start_time) {
            return alert("End time must be after Start time.");
        }

        const locId = defineEventLocationId || (currentLocation ? currentLocation.id : null);

        try {
            const res = await fetch(`${API_BASE_URL}/api/known-events/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newEvent.name.trim(),
                    start_time,
                    end_time,
                    location_id: locId ? parseInt(locId) : null,
                    note: newEvent.note,
                    force: overrideForce || forceDefineSave
                })
            });
            const data = await res.json();

            if (data.status === 'collision_warning') {
                setDefineCollisionWarning(data);
                return;
            }

            if (!res.ok || data.error) {
                alert(data.error || "Failed to create event");
                return;
            }

            const updatedEvents = await fetchKnownEvents();
            if (rawFiles.length > 0) {
                chunkiseFiles(rawFiles, updatedEvents);
            }

            setShowDefineModal(false);
            setNewEvent({ name: '', start: '', end: '', duration: '', note: '' });
            setDefineCollisionWarning(null);
            setForceDefineSave(false);
        } catch (err) {
            console.error(err);
            alert("Error connecting to server.");
        }
    };

    // Scan a single chunk or batch of files
    const scanFilesAsChunk = async (filesToScan, customName) => {
        if (!filesToScan || !filesToScan.length) return null;

        const formData = new FormData();
        filesToScan.forEach(f => formData.append('files', f));
        if (currentLocation) {
            formData.append('location_id', currentLocation.id);
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

    // --- List 1 Selection & Helpers ---
    const totalRawPages = Math.ceil(rawFiles.length / ROWS_PER_PAGE);
    const displayedRawFiles = rawFiles.slice(rawPage * ROWS_PER_PAGE, (rawPage + 1) * ROWS_PER_PAGE);

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

    // Drag selection for List 1
    const handleRawMouseDown = (idx, e) => {
        if (e.button !== 0) return;
        setIsDraggingRaw(true);
        setDragRawStart(idx);
        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragRawStart !== null) {
                const [low, high] = [Math.min(dragRawStart, idx), Math.max(dragRawStart, idx)];
                for (let i = low; i <= high; i++) next.add(i);
            } else if (e.ctrlKey || e.metaKey) {
                if (next.has(idx)) next.delete(idx);
                else next.add(idx);
            } else {
                if (!next.has(idx)) {
                    next.add(idx);
                }
            }
            return next;
        });
    };

    const handleRawMouseEnter = (idx) => {
        if (!isDraggingRaw || dragRawStart === null) return;
        const [low, high] = [Math.min(dragRawStart, idx), Math.max(dragRawStart, idx)];
        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            for (let i = low; i <= high; i++) {
                next.add(i);
            }
            return next;
        });
    };

    const handleSelectRawRange = (count) => {
        const start = rawPage * ROWS_PER_PAGE;
        const end = Math.min(start + count, rawFiles.length);
        const next = new Set(selectedRawIndices);
        for (let i = start; i < end; i++) next.add(i);
        setSelectedRawIndices(next);
    };

    const handleAnalyzeRawSelection = async () => {
        if (!rawSelectionInfo) return;
        setAnalyzingSelection(true);
        const name = `Selected Raw Chunk: ${rawSelectionInfo.count} files (${rawSelectionInfo.durationSec}s)`;
        const scanned = await scanFilesAsChunk(rawSelectionInfo.files, name);
        setActiveChunkData(scanned);
        setAnalyzingSelection(false);
    };

    // --- List 2 Selection & Helpers ---
    const getChunkSelectionInfo = () => {
        if (!selectedChunkKeys.size) return null;
        const selectedList = chunks.filter(c => selectedChunkKeys.has(c.key));
        if (!selectedList.length) return null;

        const allFiles = [];
        selectedList.forEach(c => allFiles.push(...c.files));
        const uniqueFiles = Array.from(new Set(allFiles)).sort((a, b) => getFileDateMs(a) - getFileDateMs(b));

        const times = uniqueFiles.map(f => getFileDateMs(f));
        const minTime = times.length ? Math.min(...times) : 0;
        const maxTime = times.length ? Math.max(...times) : 0;
        const durationSec = Math.max(1, Math.round((maxTime - minTime) / 1000) || (uniqueFiles.length * 10));
        const dtStr = times.length ? `${formatDateTime(minTime)} - ${formatDateTime(maxTime)}` : '';

        return {
            chunks: selectedList,
            chunkCount: selectedList.length,
            files: uniqueFiles,
            fileCount: uniqueFiles.length,
            durationSec,
            dtStr
        };
    };

    const chunkSelectionInfo = getChunkSelectionInfo();

    // Drag selection for List 2
    const handleChunkMouseDown = (key, idx, e) => {
        if (e.button !== 0) return;
        setIsDraggingChunks(true);
        setDragChunkStart(idx);
        setSelectedChunkKeys(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragChunkStart !== null) {
                const [low, high] = [Math.min(dragChunkStart, idx), Math.max(dragChunkStart, idx)];
                for (let i = low; i <= high; i++) {
                    if (chunks[i]) next.add(chunks[i].key);
                }
            } else if (e.ctrlKey || e.metaKey) {
                if (next.has(key)) next.delete(key);
                else next.add(key);
            } else {
                if (!next.has(key)) {
                    next.add(key);
                }
            }
            return next;
        });
    };

    const handleChunkMouseEnter = (idx) => {
        if (!isDraggingChunks || dragChunkStart === null) return;
        const [low, high] = [Math.min(dragChunkStart, idx), Math.max(dragChunkStart, idx)];
        setSelectedChunkKeys(prev => {
            const next = new Set(prev);
            for (let i = low; i <= high; i++) {
                if (chunks[i]) next.add(chunks[i].key);
            }
            return next;
        });
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
        }
        setAnalyzingSelection(false);
    };

    const handleSelectSingleChunk = async (chunk) => {
        setSelectedKey(chunk.key);
        setSelectedChunkKeys(new Set([chunk.key]));
        if (chunk.status === 'pending') {
            setActiveChunkData(chunk);
        } else {
            setActiveChunkData(chunk);
        }
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
                save_as_known_event: saveAsKnownEvent
            })
        });

        if (saveAsKnownEvent) {
            const updatedEvents = await fetchKnownEvents();
            if (rawFiles.length > 0) {
                chunkiseFiles(rawFiles, updatedEvents);
            }
        }
    };

    return (
        <div className="bg-dark text-light min-vh-100 d-flex flex-column font-monospace">
            {/* Header */}
            <header className="p-3 bg-dark border-bottom border-secondary d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div className="d-flex align-items-center gap-3">
                    <div>
                        <h5 className="mb-0 text-warning">Geophone Batch Analyzer</h5>
                        <small className="text-muted">Unsupervised ML Model for Training</small>
                    </div>

                    {/* Location Badge & Selector */}
                    <button
                        className="btn btn-sm badge-location px-2 py-1 d-flex align-items-center gap-1 rounded"
                        onClick={onOpenLocationModal}
                        title="Click to change location"
                    >
                        <span>📍</span>
                        <strong className="text-warning">
                            {currentLocation ? currentLocation.name : 'Select Location'}
                        </strong>
                        {currentLocation && currentLocation.latitude !== null && (
                            <span className="text-muted small">
                                ({currentLocation.latitude?.toFixed(2)}, {currentLocation.longitude?.toFixed(2)})
                            </span>
                        )}
                    </button>
                </div>

                <div className="d-flex flex-wrap align-items-center gap-2">
                    <button className="btn btn-outline-info btn-sm fw-bold" onClick={() => setShowDefineModal(true)}>
                        + Define Event
                    </button>

                    <div className="input-group input-group-sm w-auto">
                        <span className="input-group-text bg-dark text-muted border-secondary">Interval:</span>
                        <select
                            className="form-select bg-dark text-light border-secondary"
                            value={intervalMins}
                            onChange={(e) => setIntervalMins(parseInt(e.target.value))}
                        >
                            <option value="1">1 min</option>
                            <option value="2">2 mins</option>
                            <option value="5">5 mins</option>
                            <option value="10">10 mins</option>
                            <option value="30">30 mins</option>
                            <option value="60">1 Hour</option>
                        </select>
                    </div>

                    {/* Import Files Buttons */}
                    <div className="btn-group btn-group-sm">
                        <button
                            className="btn btn-warning fw-bold"
                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        >
                            📁 Import Files
                        </button>
                        <button
                            className="btn btn-outline-warning"
                            onClick={() => folderInputRef.current && folderInputRef.current.click()}
                            title="Import Entire Folder"
                        >
                            Folder
                        </button>
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="d-none"
                        multiple
                        accept=".csv"
                        onChange={handleFilesSelected}
                    />
                    <input
                        type="file"
                        ref={folderInputRef}
                        className="d-none"
                        webkitdirectory="true"
                        directory="true"
                        multiple
                        onChange={handleFilesSelected}
                    />

                    <button
                        className="btn btn-outline-warning btn-sm fw-bold"
                        onClick={runFullScan}
                        disabled={scanning || !chunks.length}
                    >
                        {scanning ? 'Scanning...' : 'Scan All Chunks'}
                    </button>

                    <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => {
                            setRawFiles([]);
                            setChunks([]);
                            setSelectedRawIndices(new Set());
                            setSelectedChunkKeys(new Set());
                            setActiveChunkData(null);
                        }}
                    >
                        Clear
                    </button>
                </div>
            </header>

            {/* Main Content Layout */}
            <div className="container-fluid flex-grow-1 d-flex p-0">
                <div className="row g-0 w-100">
                    {/* Sidebar: List 1 (Raw Files) and List 2 (Chunks) */}
                    <div className="col-md-4 col-lg-3 border-end border-secondary bg-dark d-flex flex-column" style={{ maxHeight: 'calc(100vh - 75px)' }}>
                        {/* List 1: Raw Files Panel */}
                        <div className="border-bottom border-secondary p-2 bg-dark">
                            <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="text-warning fw-bold small">
                                    📁 List 1: Raw Files ({rawFiles.length})
                                </span>
                                <button
                                    className="btn btn-outline-secondary btn-sm py-0 px-1"
                                    style={{ fontSize: '0.75rem' }}
                                    onClick={() => setShowList1(!showList1)}
                                >
                                    {showList1 ? 'Hide' : 'Show'}
                                </button>
                            </div>

                            {showList1 && rawFiles.length > 0 && (
                                <div>
                                    {/* Range selectors & quick actions */}
                                    <div className="d-flex flex-wrap gap-1 mb-2 align-items-center">
                                        <button
                                            className="btn btn-outline-light btn-sm py-0 px-1"
                                            style={{ fontSize: '0.7rem' }}
                                            onClick={() => handleSelectRawRange(100)}
                                        >
                                            +100
                                        </button>
                                        <button
                                            className="btn btn-outline-light btn-sm py-0 px-1"
                                            style={{ fontSize: '0.7rem' }}
                                            onClick={() => handleSelectRawRange(500)}
                                        >
                                            +500
                                        </button>
                                        <button
                                            className="btn btn-outline-light btn-sm py-0 px-1"
                                            style={{ fontSize: '0.7rem' }}
                                            onClick={() => handleSelectRawRange(1000)}
                                        >
                                            +1000
                                        </button>
                                        <button
                                            className="btn btn-outline-secondary btn-sm py-0 px-1"
                                            style={{ fontSize: '0.7rem' }}
                                            onClick={() => setSelectedRawIndices(new Set())}
                                        >
                                            Clear
                                        </button>
                                        <span className="text-muted small ms-auto" style={{ fontSize: '0.75rem' }}>
                                            {selectedRawIndices.size} selected
                                        </span>
                                    </div>

                                    {/* Analyze Raw Selection Button */}
                                    {rawSelectionInfo && (
                                        <button
                                            className="btn btn-warning btn-sm w-100 fw-bold mb-2 py-1"
                                            onClick={handleAnalyzeRawSelection}
                                            disabled={analyzingSelection}
                                        >
                                            {analyzingSelection ? 'Analyzing...' : `⚡ Analyze ${rawSelectionInfo.durationSec}s chunk ${rawSelectionInfo.dtStr}`}
                                        </button>
                                    )}

                                    {/* Pagination indicator if > 1000 rows */}
                                    {rawFiles.length > ROWS_PER_PAGE && (
                                        <div className="d-flex justify-content-between align-items-center mb-1 text-muted small">
                                            <span>
                                                Rows {rawPage * ROWS_PER_PAGE + 1} - {Math.min((rawPage + 1) * ROWS_PER_PAGE, rawFiles.length)}
                                            </span>
                                            <div className="btn-group btn-group-sm">
                                                <button
                                                    className="btn btn-outline-secondary btn-sm py-0 px-1"
                                                    disabled={rawPage === 0}
                                                    onClick={() => setRawPage(p => Math.max(0, p - 1))}
                                                >
                                                    &laquo;
                                                </button>
                                                <button
                                                    className="btn btn-outline-secondary btn-sm py-0 px-1"
                                                    disabled={rawPage >= totalRawPages - 1}
                                                    onClick={() => setRawPage(p => Math.min(totalRawPages - 1, p + 1))}
                                                >
                                                    &raquo;
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Raw files scroll list with drag selection */}
                                    <div
                                        className="list-group list-group-flush overflow-auto user-select-none border border-secondary rounded"
                                        style={{ maxHeight: '180px' }}
                                    >
                                        {displayedRawFiles.map((file, localIdx) => {
                                            const globalIdx = rawPage * ROWS_PER_PAGE + localIdx;
                                            const isSelected = selectedRawIndices.has(globalIdx);
                                            const fileDate = formatDateTime(getFileDateMs(file));

                                            return (
                                                <div
                                                    key={globalIdx}
                                                    className={`list-group-item list-group-item-action bg-dark text-light border-secondary p-1 selectable-item ${isSelected ? 'selected' : ''}`}
                                                    onMouseDown={(e) => handleRawMouseDown(globalIdx, e)}
                                                    onMouseEnter={() => handleRawMouseEnter(globalIdx)}
                                                >
                                                    <div className="d-flex align-items-center justify-content-between small">
                                                        <span className="text-truncate" style={{ maxWidth: '180px', fontSize: '0.8rem' }} title={file.name}>
                                                            {file.name}
                                                        </span>
                                                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                                                            {fileDate.split(' ')[1] || ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <small className="text-muted d-block mt-1" style={{ fontSize: '0.7rem' }}>
                                        💡 Tip: Click and drag down to select multiple files effortlessly.
                                    </small>
                                </div>
                            )}
                        </div>

                        {/* List 2: Chunks List Panel */}
                        <div className="flex-grow-1 d-flex flex-column p-2 overflow-hidden bg-dark">
                            <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="text-info fw-bold small">
                                    🗂️ List 2: Chunks ({chunks.length})
                                </span>
                                {selectedChunkKeys.size > 0 && (
                                    <span className="badge bg-info text-dark">
                                        {selectedChunkKeys.size} selected
                                    </span>
                                )}
                            </div>

                            {/* Batch Analyze Button for List 2 */}
                            {chunkSelectionInfo && (
                                <button
                                    className="btn btn-info btn-sm w-100 fw-bold mb-2 py-1"
                                    onClick={handleAnalyzeChunkSelection}
                                    disabled={analyzingSelection}
                                >
                                    {analyzingSelection ? 'Analyzing...' : chunkSelectionInfo.chunkCount === 1 ? (
                                        `Analyze ${chunkSelectionInfo.chunks[0].name}`
                                    ) : (
                                        `Analyze Combined ${chunkSelectionInfo.durationSec}s Batch (${chunkSelectionInfo.chunkCount} chunks)`
                                    )}
                                </button>
                            )}

                            {/* Chunks scroll list with drag selection */}
                            <div
                                className="list-group list-group-flush overflow-auto flex-grow-1 user-select-none"
                                style={{ maxHeight: 'calc(100vh - 380px)' }}
                            >
                                {chunks.length === 0 ? (
                                    <div className="text-center text-muted small py-4">
                                        No chunks generated yet. Import files to get started.
                                    </div>
                                ) : (
                                    chunks.map((c, idx) => {
                                        const isSelected = selectedChunkKeys.has(c.key);
                                        const isActive = activeChunkData && activeChunkData.key === c.key;

                                        return (
                                            <div
                                                key={c.key}
                                                className={`list-group-item list-group-item-action bg-dark text-light border-secondary p-2 mb-1 rounded selectable-item ${isSelected ? 'selected' : ''} ${isActive ? 'border-warning border-2' : ''}`}
                                                onMouseDown={(e) => handleChunkMouseDown(c.key, idx, e)}
                                                onMouseEnter={() => handleChunkMouseEnter(idx)}
                                                onClick={() => handleSelectSingleChunk(c)}
                                            >
                                                <div className="d-flex w-100 justify-content-between align-items-center">
                                                    <div>
                                                        <span
                                                            style={{
                                                                fontSize: '0.85rem',
                                                                color: c.isCustom ? '#348abd' : 'inherit',
                                                                fontWeight: c.isCustom ? 'bold' : 'normal'
                                                            }}
                                                        >
                                                            {c.name}
                                                        </span>
                                                        <br />
                                                        <small className="text-muted">
                                                            {c.files.length} files • {formatDuration(c.files.length * 10000)}
                                                        </small>
                                                    </div>
                                                    <span
                                                        className={`badge ${c.isCustom && c.status === 'pending'
                                                            ? 'bg-info text-dark'
                                                            : c.status === 'flagged'
                                                                ? 'bg-danger'
                                                                : c.status === 'clean'
                                                                    ? 'bg-success'
                                                                    : 'bg-secondary'
                                                            }`}
                                                    >
                                                        {c.isCustom && c.status === 'pending'
                                                            ? 'Known Rule'
                                                            : c.status === 'flagged'
                                                                ? `${c.anomalyCount} Flagged`
                                                                : c.status}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
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
                                chunk={activeChunkData}
                                labels={labels}
                                onSaveLabel={handleSaveLabel}
                                setLabels={setLabels}
                                currentLocation={currentLocation}
                                knownEvents={knownEvents}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Define Known Event Modal */}
            {showDefineModal && (
                <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1050 }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content bg-dark border-secondary text-light">
                            <div className="modal-header border-secondary">
                                <h5 className="modal-title text-info">📌 Define Custom Known Event</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => {
                                        setShowDefineModal(false);
                                        setDefineCollisionWarning(null);
                                    }}
                                ></button>
                            </div>
                            <div className="modal-body">
                                <p className="small text-muted mb-3">
                                    Define a recurring or verified seismic event rule. Files matching this time window will be grouped into known event chunks in List 2.
                                </p>

                                {/* Location Selection for Event */}
                                <div className="mb-3">
                                    <label className="form-label text-warning small fw-bold">Location *</label>
                                    <div className="input-group input-group-sm">
                                        <select
                                            className="form-select bg-dark text-light border-warning"
                                            value={defineEventLocationId}
                                            onChange={(e) => setDefineEventLocationId(e.target.value)}
                                        >
                                            <option value="">-- No Location (Global) --</option>
                                            {locations.map(loc => (
                                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            className="btn btn-outline-warning"
                                            type="button"
                                            onClick={onOpenLocationModal}
                                        >
                                            + New Location
                                        </button>
                                    </div>
                                </div>

                                {/* Event Name */}
                                <div className="mb-3">
                                    <label className="form-label text-info small fw-bold">Event Name *</label>
                                    <input
                                        type="text"
                                        className="form-control bg-dark text-light border-info"
                                        value={newEvent.name}
                                        onChange={e => setNewEvent({ ...newEvent, name: e.target.value })}
                                        placeholder='e.g. "Controlled Blast", "Freight Train"'
                                    />
                                </div>

                                {/* Start Date & Duration */}
                                <div className="row mb-3">
                                    <div className="col-md-6">
                                        <label className="form-label text-light small">Start Date & Time *</label>
                                        <input
                                            type="datetime-local"
                                            step="1"
                                            className="form-control bg-dark text-light border-secondary"
                                            value={newEvent.start}
                                            onChange={handleStartChange}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label text-light small">Duration (Seconds)</label>
                                        <div className="input-group">
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                className="form-control bg-dark text-light border-secondary"
                                                value={newEvent.duration}
                                                onChange={handleDurationChange}
                                                placeholder="e.g. 15"
                                            />
                                            <span className="input-group-text bg-dark text-muted border-secondary">s</span>
                                        </div>
                                    </div>
                                </div>

                                {/* End Date */}
                                <div className="mb-3">
                                    <label className="form-label text-light small">End Date & Time *</label>
                                    <input
                                        type="datetime-local"
                                        step="1"
                                        className="form-control bg-dark text-light border-secondary"
                                        value={newEvent.end}
                                        onChange={handleEndChange}
                                    />
                                </div>

                                {/* Note */}
                                <div className="mb-3">
                                    <label className="form-label text-light small">Note / Context</label>
                                    <input
                                        type="text"
                                        className="form-control bg-dark text-light border-secondary"
                                        value={newEvent.note || ''}
                                        onChange={e => setNewEvent({ ...newEvent, note: e.target.value })}
                                        placeholder="Optional description or sensor notes..."
                                    />
                                </div>

                                {/* Collision Warning Banner */}
                                {defineCollisionWarning && (
                                    <div className="alert alert-warning py-2 small mb-3">
                                        <strong>⚠️ Time Collision Warning:</strong>
                                        <p className="mb-1">{defineCollisionWarning.message}</p>
                                        <ul className="mb-2">
                                            {defineCollisionWarning.collisions.map((c, i) => (
                                                <li key={i}>
                                                    <strong>{c.name}</strong>: {formatDateTime(c.start_time)} - {formatDateTime(c.end_time)}
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="form-check">
                                            <input
                                                type="checkbox"
                                                className="form-check-input"
                                                id="forceDefineCheck"
                                                checked={forceDefineSave}
                                                onChange={e => setForceDefineSave(e.target.checked)}
                                            />
                                            <label className="form-check-label text-light" htmlFor="forceDefineCheck">
                                                I understand. Save overlapping event anyway.
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <button
                                    className="btn btn-info w-100 fw-bold"
                                    onClick={() => handleCreateEvent(forceDefineSave)}
                                >
                                    Save Known Event Rule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ChunkDetail({ chunk, labels, onSaveLabel, setLabels, currentLocation, knownEvents }) {
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const chartRef = useRef(null);
    const canvasRef = useRef(null);

    const [plotModal, setPlotModal] = useState({ visible: false, loading: false, image: null, error: null });

    // Table multi-selection state with effortless drag
    const [selectedTableEvents, setSelectedTableEvents] = useState(new Set());
    const [isDraggingTable, setIsDraggingTable] = useState(false);
    const [dragTableStart, setDragTableStart] = useState(null);

    // Label Event Popup Modal State
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [modalLabel, setModalLabel] = useState(LABEL_OPTIONS[1]);
    const [modalCustomLabel, setModalCustomLabel] = useState('');
    const [modalNote, setModalNote] = useState('');
    const [modalSaveAsKnown, setModalSaveAsKnown] = useState(false);
    const [modalCollisionWarning, setModalCollisionWarning] = useState(null);
    const [checkingCollision, setCheckingCollision] = useState(false);

    // Stop drag globally on window mouseup
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDraggingTable(false);
            setDragTableStart(null);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    // Render Waveform Chart
    useEffect(() => {
        if (!canvasRef.current || !chunk.raw) return;

        if (chartRef.current) chartRef.current.destroy();

        const startTime = chunk.startTime;
        const skip = Math.max(1, Math.floor(chunk.raw.volts.length / 2000));
        const waveData = [];
        for (let i = 0; i < chunk.raw.volts.length; i += skip) {
            waveData.push({ x: (chunk.raw.times[i] - startTime) / 1000, y: chunk.raw.volts[i] });
        }
        const scoreData = chunk.raw.blocks.map(b => ({ x: (b.time - startTime) / 1000, y: b.score }));
        const xMax = (chunk.endTime - startTime) / 1000;

        chartRef.current = new Chart(canvasRef.current, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Voltage (mV)',
                        data: waveData,
                        yAxisID: 'y',
                        borderColor: '#348abd',
                        borderWidth: 1,
                        pointRadius: 0,
                        tension: 0
                    },
                    {
                        label: 'Anomaly Score',
                        data: scoreData,
                        yAxisID: 'y1',
                        borderColor: '#d9604a',
                        borderDash: [4, 3],
                        borderWidth: 1.5,
                        pointRadius: 0
                    },
                    {
                        label: 'Threshold Limit',
                        data: [{ x: 0, y: threshold }, { x: xMax, y: threshold }],
                        yAxisID: 'y1',
                        borderColor: '#9c9080',
                        borderDash: [2, 2],
                        borderWidth: 1,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time (Seconds)', color: '#9c9080' }
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Voltage (mV)', color: '#348abd' }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Score', color: '#d9604a' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { display: true, labels: { color: '#ece5d6' } }
                }
            }
        });

        return () => chartRef.current?.destroy();
    }, [chunk, threshold]);

    if (chunk.status === 'corrupted' || !chunk.raw) {
        return (
            <div className="alert alert-danger">
                <h5>Analysis Failed</h5>
                {chunk.missing_reports && chunk.missing_reports.map((r, i) => <div key={i}>• {r}</div>)}
            </div>
        );
    }

    const currentEvents = mergeEvents(chunk.raw.blocks, threshold);

    // Table selection drag handlers
    const handleTableMouseDown = (idx, e) => {
        if (e.button !== 0) return;
        setIsDraggingTable(true);
        setDragTableStart(idx);
        setSelectedTableEvents(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragTableStart !== null) {
                const [low, high] = [Math.min(dragTableStart, idx), Math.max(dragTableStart, idx)];
                for (let i = low; i <= high; i++) next.add(i);
            } else if (e.ctrlKey || e.metaKey) {
                if (next.has(idx)) next.delete(idx);
                else next.add(idx);
            } else {
                if (!next.has(idx)) next.add(idx);
            }
            return next;
        });
    };

    const handleTableMouseEnter = (idx) => {
        if (!isDraggingTable || dragTableStart === null) return;
        const [low, high] = [Math.min(dragTableStart, idx), Math.max(dragTableStart, idx)];
        setSelectedTableEvents(prev => {
            const next = new Set(prev);
            for (let i = low; i <= high; i++) next.add(i);
            return next;
        });
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedTableEvents(new Set(currentEvents.map((_, i) => i)));
        } else {
            setSelectedTableEvents(new Set());
        }
    };

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

    // Check collision when opening label modal
    const handleOpenLabelModal = async () => {
        if (!bounds) return;
        setShowLabelModal(true);
        setModalCollisionWarning(null);
        setCheckingCollision(true);

        try {
            const res = await fetch(`${API_BASE_URL}/api/known-events/check-collision/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: bounds.minStart,
                    end_time: bounds.maxEnd,
                    location_id: currentLocation ? currentLocation.id : null
                })
            });
            const data = await res.json();
            if (data.has_collision && data.collisions && data.collisions.length > 0) {
                setModalCollisionWarning(data.collisions);
            }
        } catch (err) {
            console.error("Collision check error:", err);
        } finally {
            setCheckingCollision(false);
        }
    };

    // Save label modal execution
    const handleSaveLabelModal = async () => {
        if (!bounds) return;
        const appliedLabel = modalCustomLabel.trim() || modalLabel || 'Event';

        for (let ev of bounds.events) {
            await onSaveLabel(chunk.key, chunk.name, ev, appliedLabel, modalNote, modalSaveAsKnown);
        }

        setShowLabelModal(false);
        setSelectedTableEvents(new Set());
        setModalCustomLabel('');
        setModalNote('');
        setModalSaveAsKnown(false);
        setModalCollisionWarning(null);
    };

    const handleViewPlot = async (ev) => {
        setPlotModal({ visible: true, loading: true, image: null, error: null });

        const formData = new FormData();
        chunk.files.forEach(f => formData.append('files', f));
        formData.append('start_time', ev.startTime);
        formData.append('end_time', ev.endTime);

        try {
            const res = await fetch(`${API_BASE_URL}/api/generate-plot/`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.image) setPlotModal({ visible: true, loading: false, image: data.image, error: null });
            else setPlotModal({ visible: true, loading: false, image: null, error: data.error });
        } catch (err) {
            setPlotModal({ visible: true, loading: false, image: null, error: 'Network failure' });
        }
    };

    return (
        <div>
            {/* Title & Location Header */}
            <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <h4 className="text-light mb-0">{chunk.name} Waveform</h4>
                    {currentLocation && (
                        <small className="text-warning">📍 Station: {currentLocation.name}</small>
                    )}
                </div>
            </div>

            {chunk.missing_reports && chunk.missing_reports.length > 0 && (
                <div className="alert alert-warning py-2 small mb-3">
                    <strong>Data Gaps Detected:</strong>
                    <ul className="mb-0">{chunk.missing_reports.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
            )}

            {/* Waveform Card */}
            <div className="card bg-dark border-secondary mb-4">
                <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                    <span className="text-muted small">Continuous Interval Waveform</span>
                    <div className="d-flex align-items-center gap-2">
                        <span className="text-muted small">Threshold: {threshold.toFixed(1)}</span>
                        <input
                            type="range"
                            className="form-range"
                            style={{ width: '140px' }}
                            min="2"
                            max="15"
                            step="0.5"
                            value={threshold}
                            onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        />
                    </div>
                </div>
                <div className="card-body" style={{ height: '350px', backgroundColor: '#1e1812' }}>
                    <canvas ref={canvasRef}></canvas>
                </div>
            </div>

            {/* Flagged Events Table Card */}
            <div className="card bg-dark border-secondary">
                <div className="card-header border-secondary text-muted small d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <span>
                        Flagged Events ({currentEvents.length})
                        {selectedTableEvents.size > 0 && (
                            <span className="text-warning ms-2">({selectedTableEvents.size} rows selected)</span>
                        )}
                    </span>

                    {/* Label Event Button (enabled only if at least 1 row selected) */}
                    <button
                        className="btn btn-warning btn-sm fw-bold px-3 d-flex align-items-center gap-1"
                        disabled={selectedTableEvents.size === 0}
                        onClick={handleOpenLabelModal}
                        title={selectedTableEvents.size === 0 ? "Select at least one event row below to label" : "Label selected event(s)"}
                    >
                        <span>🏷️</span>
                        <span>Label Event {selectedTableEvents.size > 0 ? `(${selectedTableEvents.size})` : ''}</span>
                    </button>
                </div>

                <div className="card-body p-0">
                    <table className="table table-dark table-hover table-borderless mb-0 small align-middle user-select-none">
                        <thead className="border-bottom border-secondary text-muted">
                            <tr>
                                <th style={{ width: '40px' }}>
                                    <input
                                        type="checkbox"
                                        className="form-check-input border-secondary bg-dark"
                                        checked={currentEvents.length > 0 && selectedTableEvents.size === currentEvents.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th style={{ width: '40px' }}>#</th>
                                <th>Start (D&T)</th>
                                <th>Duration</th>
                                <th>Score</th>
                                <th>Label</th>
                                <th>Note</th>
                                <th>Analysis</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentEvents.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="text-center p-4 text-muted">
                                        No events crossed the threshold limit.
                                    </td>
                                </tr>
                            ) : (
                                currentEvents.map((ev, idx) => {
                                    const isSelected = selectedTableEvents.has(idx);
                                    const labelKey = `${chunk.name}_${Math.round(ev.startTime)}_${Math.round(ev.endTime)}`;
                                    const saved = labels[labelKey] || { label: '', note: '' };

                                    return (
                                        <tr
                                            key={idx}
                                            className={`selectable-row ${isSelected ? 'selected-row' : saved.label ? 'table-success' : ''}`}
                                            onMouseDown={(e) => handleTableMouseDown(idx, e)}
                                            onMouseEnter={() => handleTableMouseEnter(idx)}
                                        >
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input border-secondary bg-dark"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        const next = new Set(selectedTableEvents);
                                                        if (e.target.checked) next.add(idx);
                                                        else next.delete(idx);
                                                        setSelectedTableEvents(next);
                                                    }}
                                                />
                                            </td>
                                            <td>{idx + 1}</td>
                                            <td>{formatDateTime(ev.startTime)}</td>
                                            <td>{formatDuration(ev.endTime - ev.startTime)}</td>
                                            <td className="text-danger fw-bold">{ev.peakScore.toFixed(1)}</td>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <select
                                                    className="form-select form-select-sm bg-dark text-light border-secondary"
                                                    value={saved.label}
                                                    onChange={(e) => onSaveLabel(chunk.key, chunk.name, ev, e.target.value, saved.note)}
                                                >
                                                    {LABEL_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>
                                                            {opt || '— unlabeled —'}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm bg-dark text-light border-secondary"
                                                    placeholder="note..."
                                                    value={saved.note}
                                                    onBlur={(e) => onSaveLabel(chunk.key, chunk.name, ev, saved.label, e.target.value)}
                                                    onChange={(e) => setLabels(prev => ({
                                                        ...prev,
                                                        [labelKey]: { ...saved, note: e.target.value }
                                                    }))}
                                                />
                                            </td>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-outline-info btn-sm py-0 px-2"
                                                    style={{ fontSize: '0.75rem' }}
                                                    onClick={() => handleViewPlot(ev)}
                                                >
                                                    View Plot
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Label Event Modal with Fixed D&T and Collision Warning */}
            {showLabelModal && bounds && (
                <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1055 }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content bg-dark border-secondary text-light">
                            <div className="modal-header border-secondary">
                                <h5 className="modal-title text-warning">
                                    🏷️ Label Selected Event ({bounds.count} row{bounds.count > 1 ? 's' : ''})
                                </h5>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowLabelModal(false)}></button>
                            </div>

                            <div className="modal-body">
                                {/* Fixed Date & Time display */}
                                <div className="card bg-dark border-secondary mb-3 p-3">
                                    <h6 className="text-info small fw-bold mb-2">Fixed Date & Time Window</h6>
                                    <div className="row g-2 small">
                                        <div className="col-6">
                                            <span className="text-muted d-block">Start D&T:</span>
                                            <span className="badge bg-secondary text-light">{bounds.startFormatted}</span>
                                        </div>
                                        <div className="col-6">
                                            <span className="text-muted d-block">End D&T:</span>
                                            <span className="badge bg-secondary text-light">{bounds.endFormatted}</span>
                                        </div>
                                        <div className="col-12 mt-2">
                                            <span className="text-muted me-2">Total Duration:</span>
                                            <strong className="text-warning">{bounds.durationFormatted}</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Label Field */}
                                <div className="mb-3">
                                    <label className="form-label text-light small fw-bold">Select Event Classification *</label>
                                    <select
                                        className="form-select bg-dark text-light border-secondary mb-2"
                                        value={modalLabel}
                                        onChange={(e) => setModalLabel(e.target.value)}
                                    >
                                        {LABEL_OPTIONS.filter(o => o).map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        className="form-control form-control-sm bg-dark text-light border-secondary"
                                        placeholder="Or type custom label name..."
                                        value={modalCustomLabel}
                                        onChange={(e) => setModalCustomLabel(e.target.value)}
                                    />
                                </div>

                                {/* Note Field */}
                                <div className="mb-3">
                                    <label className="form-label text-light small">Event Note / Annotation</label>
                                    <textarea
                                        rows="2"
                                        className="form-control form-control-sm bg-dark text-light border-secondary"
                                        placeholder="Detailed note about signal characteristics, source, etc."
                                        value={modalNote}
                                        onChange={(e) => setModalNote(e.target.value)}
                                    ></textarea>
                                </div>

                                {/* Checkbox: Save as Known Event Rule */}
                                <div className="form-check mb-3">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        id="saveAsKnownCheck"
                                        checked={modalSaveAsKnown}
                                        onChange={(e) => setModalSaveAsKnown(e.target.checked)}
                                    />
                                    <label className="form-check-label text-info small" htmlFor="saveAsKnownCheck">
                                        📌 Also save as Known Event rule in database (will auto-chunk in future imports)
                                    </label>
                                </div>

                                {/* Collision Warning Display */}
                                {checkingCollision && (
                                    <div className="text-muted small mb-2">Checking time collision...</div>
                                )}
                                {modalCollisionWarning && modalCollisionWarning.length > 0 && (
                                    <div className="alert alert-warning py-2 small mb-3">
                                        <strong>⚠️ Collision Warning:</strong>
                                        <p className="mb-1">
                                            This time duration collides with {modalCollisionWarning.length} existing known event(s):
                                        </p>
                                        <ul className="mb-1">
                                            {modalCollisionWarning.map((c, i) => (
                                                <li key={i}>
                                                    <strong>{c.name}</strong> ({formatDateTime(c.start_time)} - {formatDateTime(c.end_time)})
                                                </li>
                                            ))}
                                        </ul>
                                        <small className="text-muted">You may still proceed to save the label.</small>
                                    </div>
                                )}

                                <button
                                    className="btn btn-warning w-100 fw-bold"
                                    onClick={handleSaveLabelModal}
                                >
                                    Save Label {modalSaveAsKnown ? '& Known Event' : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Spectrogram / Zoom Modal */}
            {plotModal.visible && (
                <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1060 }}>
                    <div className="modal-dialog modal-xl modal-dialog-centered">
                        <div className="modal-content bg-dark border-secondary">
                            <div className="modal-header border-secondary">
                                <h5 className="modal-title text-light">Event Analysis & Spectrogram</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setPlotModal({ ...plotModal, visible: false })}
                                ></button>
                            </div>
                            <div
                                className="modal-body text-center p-0"
                                style={{
                                    minHeight: '300px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {plotModal.loading && <div className="spinner-border text-warning" role="status"></div>}
                                {plotModal.error && (
                                    <div className="text-danger p-4">Error generating plot: {plotModal.error}</div>
                                )}
                                {plotModal.image && (
                                    <img
                                        src={`data:image/png;base64,${plotModal.image}`}
                                        alt="Event Spectrogram"
                                        className="img-fluid w-100"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
