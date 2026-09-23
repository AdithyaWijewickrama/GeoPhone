import React, {useEffect, useRef, useState} from 'react';
import Chart from 'chart.js/auto';
import './App.css';
import {formatDuration, formatTime, mergeEvents} from './utils';

const LABEL_OPTIONS = ['', 'Footstep / foot traffic', 'Vehicle', 'Seismic event / tremor', 'Wind / environmental', 'Equipment / machinery', 'Sensor artifact', 'False positive', 'Unknown'];
const DEFAULT_THRESHOLD = 5;
const API_BASE_URL = process.env.REACT_APP_API_URL||'http://127.0.0.1:8000';

function App() {
    const [chunks, setChunks] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [intervalMins, setIntervalMins] = useState(10);
    const [labels, setLabels] = useState({});

    const folderInputRef = useRef(null);

    const parseFilenameDate = (filename) => {
        const match = filename.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
        if (!match) return new Date();
        const parts = match[1].split('_');
        return new Date(`${parts[0]}T${parts[1].replace(/-/g, ':')}`);
    };

    const handleAddFiles = (e) => {
        const rawFiles = Array.from(e.target.files).filter(f => /\.csv$/i.test(f.name));
        if (!rawFiles.length) return;

        const grouped = {};
        rawFiles.forEach(f => {
            const date = parseFilenameDate(f.name);
            const ms = date.getTime();
            const chunkTime = ms - (ms % (intervalMins * 60 * 1000));

            if (!grouped[chunkTime]) grouped[chunkTime] = [];
            grouped[chunkTime].push(f);
        });

        const newChunks = Object.keys(grouped).map(timeKey => {
            const dateStr = new Date(parseInt(timeKey)).toLocaleString([], {dateStyle: 'short', timeStyle: 'short'});
            return {
                key: timeKey,
                name: `${intervalMins}m Chunk: ${dateStr}`,
                files: grouped[timeKey].sort((a, b) => parseFilenameDate(a.name) - parseFilenameDate(b.name)),
                status: 'pending'
            };
        });

        setChunks(prev => [...prev, ...newChunks].sort((a, b) => parseInt(a.key) - parseInt(b.key)));
        e.target.value = '';
    };

    const scanChunk = async (chunk) => {
        const formData = new FormData();
        chunk.files.forEach(f => formData.append('files', f));

        try {
            const res = await fetch(`${API_BASE_URL}/api/process-chunk/`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (!data.ok) return {...chunk, status: 'corrupted', missing_reports: data.missing || [data.error]};

            const events = mergeEvents(data.blocks, DEFAULT_THRESHOLD);
            return {
                ...chunk,
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
            console.log(err);
            return {...chunk, status: 'corrupted', missing_reports: ['Network/Server Error']};
        }
    };

    const runFullScan = async () => {
        const pending = chunks.filter(c => c.status === 'pending');
        if (!pending.length) return;
        setScanning(true);
        for (let i = 0; i < pending.length; i++) {
            setChunks(prev => prev.map(c => c.key === pending[i].key ? {...c, status: 'processing'} : c));
            const updated = await scanChunk(pending[i]);
            setChunks(prev => prev.map(c => c.key === pending[i].key ? updated : c));
        }
        setScanning(false);
    };

    const handleSaveLabel = async (chunkKey, chunkName, event, label, note) => {
        const labelKey = `${chunkKey}::${Math.round(event.startTime)}_${Math.round(event.endTime)}`;

        setLabels(prev => {
            const newLabels = {...prev};
            if (!label && !note) delete newLabels[labelKey];
            else newLabels[labelKey] = {label, note};
            return newLabels;
        });

        await fetch(`${API_BASE_URL}/api/save-label/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                file: chunkName, // Saving against the chunk name
                startTime: event.startTime,
                endTime: event.endTime,
                duration: (event.endTime - event.startTime) / 1000,
                peakScore: event.peakScore,
                label,
                note
            })
        });
    };

    const selectedChunk = chunks.find(c => c.key === selectedKey);

    return (
        <div className="bg-dark text-light min-vh-100 d-flex flex-column font-monospace">
            <header
                className="p-3 bg-dark border-bottom border-secondary d-flex justify-content-between align-items-center">
                <div>
                    <h5 className="mb-0 text-warning">Geophone Batch Analyzer</h5>
                    <small className="text-muted">Unsupervised ML Model for Training</small>
                </div>
                <div className="d-flex align-items-center gap-3">
                    <div className="input-group input-group-sm w-auto">
                        <span className="input-group-text bg-dark text-muted border-secondary">Interval:</span>
                        <select
                            className="form-select bg-dark text-light border-secondary"
                            value={intervalMins}
                            onChange={(e) => setIntervalMins(parseInt(e.target.value))}
                        >
                            <option value="1">1 mins</option>
                            <option value="2">2 mins</option>
                            <option value="5">5 mins</option>
                            <option value="10">10 mins</option>
                            <option value="30">30 mins</option>
                            <option value="60">1 Hour</option>
                        </select>
                    </div>
                    <button className="btn btn-outline-light btn-sm"
                            onClick={() => folderInputRef.current.click()}>Import Folder
                    </button>
                    <button className="btn btn-warning btn-sm fw-bold" onClick={runFullScan} disabled={scanning}>Scan
                        All Chunks
                    </button>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => setChunks([])}>Clear</button>
                    <input type="file" ref={folderInputRef} className="d-none" webkitdirectory="true" directory="true"
                           multiple onChange={handleAddFiles}/>
                </div>
            </header>

            <div className="container-fluid flex-grow-1 d-flex p-0">
                <div className="row g-0 w-100">
                    <div className="col-md-3 border-end border-secondary bg-dark overflow-auto"
                         style={{maxHeight: 'calc(100vh - 70px)'}}>
                        <div className="list-group list-group-flush mt-2">
                            {chunks.map(c => (
                                <button
                                    key={c.key}
                                    className={`list-group-item list-group-item-action bg-dark text-light border-secondary ${selectedKey === c.key ? 'border-start border-warning border-4' : ''}`}
                                    onClick={() => setSelectedKey(c.key)}
                                >
                                    <div className="d-flex w-100 justify-content-between align-items-center">
                                        <span style={{fontSize: '0.85rem'}}>{c.name} <br/><small
                                            className="text-muted">{c.files.length} files</small></span>
                                        <span
                                            className={`badge ${c.status === 'flagged' ? 'bg-danger' : c.status === 'clean' ? 'bg-success' : 'bg-secondary'}`}>
                                            {c.status === 'flagged' ? c.anomalyCount : c.status}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="col-md-9 p-4 overflow-auto" style={{maxHeight: 'calc(100vh - 70px)'}}>
                        {!selectedChunk ? (
                            <div className="text-center text-muted mt-5"><h3>No interval selected</h3></div>
                        ) : selectedChunk.status === 'pending' || selectedChunk.status === 'processing' ? (
                            <div className="text-center mt-5">
                                <h4 className="text-muted">Chunk Ready</h4>
                                <button
                                    className="btn btn-warning fw-bold mt-3"
                                    disabled={selectedChunk.status === 'processing'}
                                    onClick={() => scanChunk(selectedChunk).then(u => setChunks(p => p.map(c => c.key === u.key ? u : c)))}
                                >
                                    {selectedChunk.status === 'processing' ? 'Processing...' : `Analyze ${selectedChunk.name}`}
                                </button>
                            </div>
                        ) : (
                            <ChunkDetail chunk={selectedChunk} labels={labels} onSaveLabel={handleSaveLabel}
                                         setLabels={setLabels}/>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ChunkDetail({chunk, labels, onSaveLabel, setLabels}) {
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const chartRef = useRef(null);
    const canvasRef = useRef(null);

    const [plotModal, setPlotModal] = useState({visible: false, loading: false, image: null, error: null});

    // NEW: Bulk selection state
    const [selectedEvents, setSelectedEvents] = useState(new Set());
    const [bulkLabel, setBulkLabel] = useState('');

    useEffect(() => {
        if (!canvasRef.current || !chunk.raw) return;

        if (chartRef.current) chartRef.current.destroy();

        const startTime = chunk.startTime;
        const skip = Math.max(1, Math.floor(chunk.raw.volts.length / 2000));
        const waveData = [];
        for (let i = 0; i < chunk.raw.volts.length; i += skip) {
            waveData.push({x: (chunk.raw.times[i] - startTime) / 1000, y: chunk.raw.volts[i]});
        }
        const scoreData = chunk.raw.blocks.map(b => ({x: (b.time - startTime) / 1000, y: b.score}));
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
                        data: [{x: 0, y: threshold}, {x: xMax, y: threshold}],
                        yAxisID: 'y1',
                        borderColor: '#9c9080',
                        borderDash: [2, 2],
                        borderWidth: 1,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: {display: true, text: 'Time (Seconds)', color: '#9c9080'}
                    },
                    y: {
                        position: 'left',
                        title: {display: true, text: 'Voltage (mV)', color: '#348abd'}
                    },
                    y1: {
                        position: 'right',
                        title: {display: true, text: 'Score', color: '#d9604a'},
                        grid: {drawOnChartArea: false}
                    }
                },
                plugins: {
                    // FIX 1: Restore Legend
                    legend: {display: true, labels: {color: '#ece5d6'}}
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

    // FIX 2: Bulk Selection Functions
    const handleSelectAll = (e) => {
        if (e.target.checked) setSelectedEvents(new Set(currentEvents.map((_, i) => i)));
        else setSelectedEvents(new Set());
    };

    const handleSelectOne = (idx, checked) => {
        const newSet = new Set(selectedEvents);
        if (checked) newSet.add(idx);
        else newSet.delete(idx);
        setSelectedEvents(newSet);
    };

    const applyBulkLabel = async () => {
        if (!bulkLabel || selectedEvents.size === 0) return;
        for (let idx of selectedEvents) {
            const ev = currentEvents[idx];
            await onSaveLabel(chunk.key, chunk.name, ev, bulkLabel, '');
        }
        setSelectedEvents(new Set());
        setBulkLabel('');
    };

    const handleViewPlot = async (ev) => {
        setPlotModal({visible: true, loading: true, image: null, error: null});

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

            if (data.image) setPlotModal({visible: true, loading: false, image: data.image, error: null});
            else setPlotModal({visible: true, loading: false, image: null, error: data.error});
        } catch (err) {
            setPlotModal({visible: true, loading: false, image: null, error: 'Network failure'});
        }
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="text-light">{chunk.name} Overarching Plot</h4>
            </div>

            {chunk.missing_reports && chunk.missing_reports.length > 0 && (
                <div className="alert alert-warning py-2 small mb-3">
                    <strong>Data Gaps Detected:</strong>
                    <ul className="mb-0">{chunk.missing_reports.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
            )}

            <div className="card bg-dark border-secondary mb-4">
                <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                    <span className="text-muted small">Continuous Interval Waveform</span>
                    <input type="range" className="form-range w-25" min="2" max="15" step="0.5" value={threshold}
                           onChange={(e) => setThreshold(parseFloat(e.target.value))}/>
                </div>
                <div className="card-body" style={{height: '350px', backgroundColor: '#1e1812'}}>
                    <canvas ref={canvasRef}></canvas>
                </div>
            </div>

            <div className="card bg-dark border-secondary">
                <div
                    className="card-header border-secondary text-muted small d-flex justify-content-between align-items-center">
                    <span>Flagged Events ({currentEvents.length})</span>

                    {/* NEW: Bulk Labeling Controls */}
                    {selectedEvents.size > 0 && (
                        <div className="input-group input-group-sm w-auto">
                            <select
                                className="form-select bg-dark text-light border-secondary"
                                value={bulkLabel}
                                onChange={(e) => setBulkLabel(e.target.value)}
                            >
                                <option value="">-- Apply Label to {selectedEvents.size} Events --</option>
                                {LABEL_OPTIONS.filter(o => o).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <button className="btn btn-warning fw-bold" onClick={applyBulkLabel}>Apply Bulk</button>
                        </div>
                    )}
                </div>
                <div className="card-body p-0">
                    <table className="table table-dark table-hover table-borderless mb-0 small align-middle">
                        <thead className="border-bottom border-secondary text-muted">
                        <tr>
                            {/* NEW: Select All Checkbox */}
                            <th style={{width: '40px'}}>
                                <input
                                    type="checkbox"
                                    className="form-check-input border-secondary bg-dark"
                                    checked={currentEvents.length > 0 && selectedEvents.size === currentEvents.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th>#</th>
                            <th>Start</th>
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
                                <td colSpan="8" className="text-center p-4 text-muted">No events crossed the
                                    threshold.
                                </td>
                            </tr>
                        ) : (
                            currentEvents.map((ev, idx) => {
                                const labelKey = `${chunk.key}::${Math.round(ev.startTime)}_${Math.round(ev.endTime)}`;
                                const saved = labels[labelKey] || {label: '', note: ''};

                                return (
                                    <tr key={idx} className={saved.label ? 'table-success' : ''}>
                                        {/* NEW: Individual Row Checkbox */}
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="form-check-input border-secondary bg-dark"
                                                checked={selectedEvents.has(idx)}
                                                onChange={(e) => handleSelectOne(idx, e.target.checked)}
                                            />
                                        </td>
                                        <td>{idx + 1}</td>
                                        <td>{formatTime(ev.startTime)}</td>
                                        <td>{formatDuration(ev.endTime - ev.startTime)}</td>
                                        <td className="text-danger">{ev.peakScore.toFixed(1)}</td>
                                        <td>
                                            <select
                                                className="form-select form-select-sm bg-dark text-light border-secondary"
                                                value={saved.label}
                                                onChange={(e) => onSaveLabel(chunk.key, chunk.name, ev, e.target.value, saved.note)}
                                            >
                                                {LABEL_OPTIONS.map(opt => <option key={opt}
                                                                                  value={opt}>{opt || '— unlabeled —'}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                                placeholder="note..."
                                                value={saved.note}
                                                onBlur={(e) => onSaveLabel(chunk.key, chunk.name, ev, saved.label, e.target.value)}
                                                onChange={(e) => setLabels(prev => ({
                                                    ...prev,
                                                    [labelKey]: {...saved, note: e.target.value}
                                                }))}
                                            />
                                        </td>
                                        <td>
                                            <button className="btn btn-outline-info btn-sm"
                                                    onClick={() => handleViewPlot(ev)}>View Plot
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

            {/* Bootstrap Modal Overlay for the Image */}
            {plotModal.visible && (
                <div className="modal d-block" style={{backgroundColor: 'rgba(0,0,0,0.85)'}}>
                    <div className="modal-dialog modal-xl modal-dialog-centered">
                        <div className="modal-content bg-dark border-secondary">
                            <div className="modal-header border-secondary">
                                <h5 className="modal-title text-light">Event Analysis</h5>
                                <button type="button" className="btn-close btn-close-white"
                                        onClick={() => setPlotModal({...plotModal, visible: false})}></button>
                            </div>
                            <div className="modal-body text-center p-0" style={{
                                minHeight: '300px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {plotModal.loading && <div className="spinner-border text-warning" role="status"></div>}
                                {plotModal.error &&
                                    <div className="text-danger">Error generating plot: {plotModal.error}</div>}
                                {plotModal.image &&
                                    <img src={`data:image/png;base64,${plotModal.image}`} alt="Event Spectrogram"
                                         className="img-fluid w-100"/>}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;