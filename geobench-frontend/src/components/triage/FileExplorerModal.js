import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatDateTime, parseFilenameDate, getFileDateMs } from '../../utils';

export default function FileExplorerModal({
    show,
    onClose,
    onImportFiles,
    currentLocation,
    locations = []
}) {
    // Current simulated folder path & navigation
    const [currentPath, setCurrentPath] = useState(['This PC', 'Local Disk (C:)', 'GeoData', '2026-04-16']);
    const [history, setHistory] = useState([['This PC', 'Local Disk (C:)', 'GeoData', '2026-04-16']]);
    const [historyIdx, setHistoryIdx] = useState(0);

    // Explorer view mode: 'details', 'icons', 'list'
    const [viewMode, setViewMode] = useState('details');

    // Search query
    const [searchQuery, setSearchQuery] = useState('');

    // Loaded / Staged files in explorer
    const [stagedFiles, setStagedFiles] = useState([]);

    // Selected file indices or keys
    const [selectedIndices, setSelectedIndices] = useState(new Set());

    // Native file input refs inside explorer
    const filePickerRef = useRef(null);
    const folderPickerRef = useRef(null);

    // Drag-over state for drag and drop
    const [isDragOver, setIsDragOver] = useState(false);

    // Initialize with sample/demo geophone files for easy testing if none loaded
    useEffect(() => {
        if (show && stagedFiles.length === 0) {
            const sample1 = new File(
                ['timestamp,voltage\n2026-04-16 23:00:00,0.45\n2026-04-16 23:00:01,0.52\n'],
                'geophone_2026-04-16_23-00-00.csv',
                { type: 'text/csv', lastModified: new Date('2026-04-16T23:00:00').getTime() }
            );
            const sample2 = new File(
                ['timestamp,voltage\n2026-04-16 23:01:00,0.61\n2026-04-16 23:01:01,0.48\n'],
                'geophone_2026-04-16_23-01-00.csv',
                { type: 'text/csv', lastModified: new Date('2026-04-16T23:01:00').getTime() }
            );
            const sample3 = new File(
                ['timestamp,voltage\n2026-04-16 22:00:00,0.30\n2026-04-16 22:00:01,0.35\n'],
                'geophone_2026-04-16_22-00-00.csv',
                { type: 'text/csv', lastModified: new Date('2026-04-16T22:00:00').getTime() }
            );
            setStagedFiles([sample1, sample2, sample3]);
            setSelectedIndices(new Set([0, 1, 2]));
        }
    }, [show]);

    // Handle native file selection from local system
    const handleNativeFiles = (e) => {
        const files = Array.from(e.target.files).filter(f => /\.csv$/i.test(f.name));
        if (files.length > 0) {
            const combined = [...stagedFiles, ...files];
            // Remove duplicates by name
            const uniqueMap = new Map();
            combined.forEach(f => uniqueMap.set(f.name, f));
            const uniqueFiles = Array.from(uniqueMap.values());
            setStagedFiles(uniqueFiles);
            // Select all newly added files
            setSelectedIndices(new Set(uniqueFiles.map((_, i) => i)));
        }
        e.target.value = '';
    };

    // Handle Drag & Drop files into Explorer
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => /\.csv$/i.test(f.name));
        if (droppedFiles.length > 0) {
            const combined = [...stagedFiles, ...droppedFiles];
            const uniqueMap = new Map();
            combined.forEach(f => uniqueMap.set(f.name, f));
            const uniqueFiles = Array.from(uniqueMap.values());
            setStagedFiles(uniqueFiles);
            setSelectedIndices(new Set(uniqueFiles.map((_, i) => i)));
        }
    };

    // Filter files by search
    const filteredFiles = useMemo(() => {
        if (!searchQuery) return stagedFiles;
        const q = searchQuery.toLowerCase();
        return stagedFiles.filter(f => f.name.toLowerCase().includes(q));
    }, [stagedFiles, searchQuery]);

    // Navigation handlers
    const navigateTo = (newPath) => {
        const newHist = history.slice(0, historyIdx + 1);
        newHist.push(newPath);
        setHistory(newHist);
        setHistoryIdx(newHist.length - 1);
        setCurrentPath(newPath);
    };

    const handleBack = () => {
        if (historyIdx > 0) {
            setHistoryIdx(historyIdx - 1);
            setCurrentPath(history[historyIdx - 1]);
        }
    };

    const handleForward = () => {
        if (historyIdx < history.length - 1) {
            setHistoryIdx(historyIdx + 1);
            setCurrentPath(history[historyIdx + 1]);
        }
    };

    const handleUp = () => {
        if (currentPath.length > 1) {
            navigateTo(currentPath.slice(0, -1));
        }
    };

    // Selection handlers
    const handleToggleSelect = (idx, e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        setSelectedIndices(prev => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedIndices.size === filteredFiles.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(filteredFiles.map((_, i) => i)));
        }
    };

    // Import action
    const handleConfirmImport = () => {
        const selected = Array.from(selectedIndices).map(i => filteredFiles[i]).filter(Boolean);
        if (selected.length > 0) {
            onImportFiles(selected);
            onClose();
        } else if (stagedFiles.length > 0) {
            onImportFiles(stagedFiles);
            onClose();
        }
    };

    if (!show) return null;

    const selectedCount = selectedIndices.size;
    const selectedFileNames = Array.from(selectedIndices)
        .map(i => filteredFiles[i]?.name)
        .filter(Boolean)
        .join('; ');

    return (
        <div
            className="modal fade show d-block"
            tabIndex="-1"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)', zIndex: 1060 }}
            onClick={onClose}
        >
            <div
                className="modal-dialog modal-xl modal-dialog-centered"
                style={{ maxWidth: '1020px' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="modal-content text-light shadow-lg border"
                    style={{
                        backgroundColor: '#182234',
                        borderColor: '#2d3e58',
                        borderRadius: '10px',
                        overflow: 'hidden'
                    }}
                >
                    {/* Windows Explorer Style Title Bar */}
                    <div
                        className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom"
                        style={{ backgroundColor: '#101726', borderColor: '#233148' }}
                    >
                        <div className="d-flex align-items-center gap-2">
                            <span style={{ fontSize: '1.1rem' }}>📁</span>
                            <span className="fw-semibold small" style={{ letterSpacing: '0.3px', color: '#e2e8f0' }}>
                                Open Files — Windows File Explorer
                            </span>
                        </div>
                        <div className="d-flex align-items-center gap-1">
                            <button
                                className="btn btn-sm btn-link text-muted p-0 px-2 text-decoration-none"
                                title="Minimize"
                                style={{ fontSize: '0.8rem' }}
                            >
                                🗕
                            </button>
                            <button
                                className="btn btn-sm btn-link text-muted p-0 px-2 text-decoration-none"
                                title="Maximize"
                                style={{ fontSize: '0.8rem' }}
                            >
                                🗖
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-danger p-0 px-2"
                                onClick={onClose}
                                title="Close"
                                style={{ fontSize: '0.8rem', lineHeight: '1.2' }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Ribbon / Navigation & Breadcrumb Toolbar */}
                    <div
                        className="px-3 py-2 border-bottom d-flex flex-wrap align-items-center gap-2"
                        style={{ backgroundColor: '#141d2e', borderColor: '#233148' }}
                    >
                        {/* Navigation Arrows */}
                        <div className="btn-group btn-group-sm">
                            <button
                                className="btn btn-outline-secondary py-1 px-2"
                                disabled={historyIdx <= 0}
                                onClick={handleBack}
                                title="Back"
                            >
                                ◀
                            </button>
                            <button
                                className="btn btn-outline-secondary py-1 px-2"
                                disabled={historyIdx >= history.length - 1}
                                onClick={handleForward}
                                title="Forward"
                            >
                                ▶
                            </button>
                            <button
                                className="btn btn-outline-secondary py-1 px-2"
                                disabled={currentPath.length <= 1}
                                onClick={handleUp}
                                title="Up to parent directory"
                            >
                                ⬆
                            </button>
                        </div>

                        {/* Breadcrumbs / Address Bar */}
                        <div
                            className="flex-grow-1 d-flex align-items-center bg-dark border border-secondary rounded px-2 py-1"
                            style={{ minWidth: '220px', fontSize: '0.82rem' }}
                        >
                            <span className="me-2 text-warning">📁</span>
                            <div className="d-flex align-items-center flex-wrap gap-1">
                                {currentPath.map((segment, idx) => (
                                    <React.Fragment key={idx}>
                                        <span
                                            className="badge bg-secondary bg-opacity-50 text-light px-2 py-1 cursor-pointer"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => navigateTo(currentPath.slice(0, idx + 1))}
                                        >
                                            {segment}
                                        </span>
                                        {idx < currentPath.length - 1 && <span className="text-muted small">›</span>}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="input-group input-group-sm" style={{ width: '200px' }}>
                            <span className="input-group-text bg-dark text-muted border-secondary">🔍</span>
                            <input
                                type="text"
                                className="form-control bg-dark text-light border-secondary"
                                placeholder="Search CSV (*.csv)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* View Mode Toggle */}
                        <div className="btn-group btn-group-sm">
                            <button
                                className={`btn ${viewMode === 'details' ? 'btn-info text-dark fw-bold' : 'btn-outline-secondary'} py-1 px-2`}
                                onClick={() => setViewMode('details')}
                                title="Details View"
                            >
                                📋 Details
                            </button>
                            <button
                                className={`btn ${viewMode === 'icons' ? 'btn-info text-dark fw-bold' : 'btn-outline-secondary'} py-1 px-2`}
                                onClick={() => setViewMode('icons')}
                                title="Large Icons"
                            >
                                🔲 Icons
                            </button>
                        </div>
                    </div>

                    {/* Secondary Actions Toolbar */}
                    <div
                        className="px-3 py-1 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2 small"
                        style={{ backgroundColor: '#101726', borderColor: '#233148' }}
                    >
                        <div className="d-flex align-items-center gap-2">
                            <button
                                className="btn btn-outline-warning btn-sm py-0 px-2 fw-semibold"
                                style={{ fontSize: '0.78rem' }}
                                onClick={() => filePickerRef.current && filePickerRef.current.click()}
                            >
                                📄 Browse PC Files
                            </button>
                            <button
                                className="btn btn-outline-secondary btn-sm py-0 px-2"
                                style={{ fontSize: '0.78rem' }}
                                onClick={() => folderPickerRef.current && folderPickerRef.current.click()}
                            >
                                📁 Browse PC Folder
                            </button>
                            <input
                                type="file"
                                ref={filePickerRef}
                                className="d-none"
                                multiple
                                accept=".csv"
                                onChange={handleNativeFiles}
                            />
                            <input
                                type="file"
                                ref={folderPickerRef}
                                className="d-none"
                                webkitdirectory="true"
                                directory="true"
                                multiple
                                onChange={handleNativeFiles}
                            />
                        </div>

                        <div className="d-flex align-items-center gap-2">
                            <button
                                className="btn btn-outline-secondary btn-sm py-0 px-2"
                                style={{ fontSize: '0.75rem' }}
                                onClick={handleSelectAll}
                            >
                                {selectedIndices.size === filteredFiles.length ? 'Deselect All' : 'Select All'}
                            </button>
                            <button
                                className="btn btn-outline-secondary btn-sm py-0 px-2"
                                style={{ fontSize: '0.75rem' }}
                                onClick={() => setSelectedIndices(new Set())}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Main Body: Split Sidebar & Content Area */}
                    <div className="d-flex" style={{ height: '380px' }}>
                        {/* Left Windows Navigation Pane (Tree) */}
                        <div
                            className="border-end p-2 overflow-auto"
                            style={{
                                width: '220px',
                                minWidth: '200px',
                                backgroundColor: '#111928',
                                borderColor: '#233148',
                                fontSize: '0.82rem'
                            }}
                        >
                            <div className="text-muted fw-bold px-2 py-1 mb-1" style={{ fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                                ⭐ QUICK ACCESS
                            </div>
                            <div
                                className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer hover-highlight"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateTo(['Quick Access', 'Desktop'])}
                            >
                                <span>🖥️</span> <span>Desktop</span>
                            </div>
                            <div
                                className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer hover-highlight"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateTo(['Quick Access', 'Downloads'])}
                            >
                                <span>⬇️</span> <span>Downloads</span>
                            </div>
                            <div
                                className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer hover-highlight"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateTo(['Quick Access', 'Documents'])}
                            >
                                <span>📄</span> <span>Documents</span>
                            </div>
                            <div
                                className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer hover-highlight text-info fw-semibold"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateTo(['This PC', 'Local Disk (C:)', 'GeoData', '2026-04-16'])}
                            >
                                <span>📁</span> <span>Seismic Data (2026)</span>
                            </div>

                            <hr className="my-2 border-secondary opacity-25" />

                            <div className="text-muted fw-bold px-2 py-1 mb-1" style={{ fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                                💻 THIS PC
                            </div>
                            <div
                                className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer hover-highlight"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateTo(['This PC', 'Local Disk (C:)'])}
                            >
                                <span>💾</span> <span>Local Disk (C:)</span>
                            </div>
                            <div
                                className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer hover-highlight"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateTo(['This PC', 'GeoStorage (D:)'])}
                            >
                                <span>💾</span> <span>GeoStorage (D:)</span>
                            </div>
                            <div
                                className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer hover-highlight"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateTo(['This PC', 'USB Sensor (E:)'])}
                            >
                                <span>🔌</span> <span>USB Sensor (E:)</span>
                            </div>

                            {locations.length > 0 && (
                                <>
                                    <hr className="my-2 border-secondary opacity-25" />
                                    <div className="text-muted fw-bold px-2 py-1 mb-1" style={{ fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                                        📍 STATIONS
                                    </div>
                                    {locations.map(loc => (
                                        <div
                                            key={loc.id}
                                            className="p-1 px-2 rounded mb-1 d-flex align-items-center gap-2 cursor-pointer text-truncate hover-highlight"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => navigateTo(['Stations', loc.name])}
                                            title={loc.name}
                                        >
                                            <span>📍</span> <span className="text-truncate">{loc.name}</span>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Right Content Area (Files Details or Icons View) */}
                        <div
                            className={`flex-grow-1 p-2 overflow-auto position-relative ${isDragOver ? 'bg-primary bg-opacity-10 border border-2 border-primary border-dashed' : ''}`}
                            style={{ backgroundColor: '#141e30' }}
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                        >
                            {filteredFiles.length === 0 ? (
                                <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center text-muted p-4">
                                    <span style={{ fontSize: '2.5rem' }}>📂</span>
                                    <h6 className="mt-2 text-light">This folder is empty</h6>
                                    <p className="small mb-3">
                                        Drag and drop CSV files here or use the browse buttons above.
                                    </p>
                                    <button
                                        className="btn btn-warning btn-sm fw-bold px-3"
                                        onClick={() => filePickerRef.current && filePickerRef.current.click()}
                                    >
                                        Browse PC Files
                                    </button>
                                </div>
                            ) : viewMode === 'details' ? (
                                <table className="table table-dark table-hover table-borderless small align-middle mb-0 user-select-none">
                                    <thead className="border-bottom border-secondary text-muted" style={{ position: 'sticky', top: 0, backgroundColor: '#141e30', zIndex: 2 }}>
                                        <tr>
                                            <th style={{ width: '35px' }}>
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input bg-dark border-secondary"
                                                    checked={filteredFiles.length > 0 && selectedIndices.size === filteredFiles.length}
                                                    onChange={handleSelectAll}
                                                />
                                            </th>
                                            <th>Name</th>
                                            <th>Date modified</th>
                                            <th>Type</th>
                                            <th className="text-end">Size</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredFiles.map((file, idx) => {
                                            const isSelected = selectedIndices.has(idx);
                                            const fileMs = getFileDateMs(file);
                                            const sizeKb = file.size ? `${(file.size / 1024).toFixed(1)} KB` : '45.0 KB';

                                            return (
                                                <tr
                                                    key={file.name + '_' + idx}
                                                    className={`cursor-pointer ${isSelected ? 'table-primary text-light' : ''}`}
                                                    onClick={(e) => handleToggleSelect(idx, e)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <td onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            className="form-check-input bg-dark border-secondary"
                                                            checked={isSelected}
                                                            onChange={(e) => handleToggleSelect(idx, e)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <span className="me-2 text-success">📊</span>
                                                        <strong className="text-light">{file.name}</strong>
                                                    </td>
                                                    <td className="text-muted">{formatDateTime(fileMs)}</td>
                                                    <td className="text-muted">Microsoft Excel CSV File</td>
                                                    <td className="text-end text-muted">{sizeKb}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                /* Icons Grid View */
                                <div className="d-flex flex-wrap gap-2 p-2">
                                    {filteredFiles.map((file, idx) => {
                                        const isSelected = selectedIndices.has(idx);
                                        return (
                                            <div
                                                key={file.name + '_' + idx}
                                                className={`p-2 rounded border text-center cursor-pointer ${isSelected ? 'bg-primary bg-opacity-25 border-info' : 'bg-dark bg-opacity-50 border-secondary'}`}
                                                style={{ width: '130px', cursor: 'pointer' }}
                                                onClick={(e) => handleToggleSelect(idx, e)}
                                            >
                                                <div style={{ fontSize: '2rem' }}>📊</div>
                                                <div className="small text-truncate mt-1 text-light" title={file.name}>
                                                    {file.name}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                                                    CSV File
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Windows Explorer Bottom Dialog Controls & Status */}
                    <div
                        className="px-3 py-2 border-top"
                        style={{ backgroundColor: '#101726', borderColor: '#233148' }}
                    >
                        <div className="row g-2 align-items-center mb-2">
                            <div className="col-md-2 text-muted small text-md-end">
                                File name:
                            </div>
                            <div className="col-md-7">
                                <input
                                    type="text"
                                    className="form-control form-control-sm bg-dark text-light border-secondary"
                                    readOnly
                                    value={selectedFileNames || (filteredFiles.length > 0 ? `*.csv (${filteredFiles.length} files in folder)` : '*.csv')}
                                />
                            </div>
                            <div className="col-md-3">
                                <select className="form-select form-select-sm bg-dark text-light border-secondary" disabled>
                                    <option>CSV Data Files (*.csv)</option>
                                    <option>All Files (*.*)</option>
                                </select>
                            </div>
                        </div>

                        <div className="d-flex justify-content-between align-items-center pt-1 border-top border-secondary border-opacity-25">
                            <div className="text-muted small" style={{ fontSize: '0.75rem' }}>
                                <span>{filteredFiles.length} items</span>
                                <span className="mx-2">•</span>
                                <span className="text-info fw-semibold">{selectedCount} items selected</span>
                            </div>

                            <div className="d-flex align-items-center gap-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary btn-sm px-3"
                                    onClick={onClose}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-warning btn-sm fw-bold px-4"
                                    onClick={handleConfirmImport}
                                    disabled={stagedFiles.length === 0}
                                >
                                    Open / Import {selectedCount > 0 ? `(${selectedCount})` : stagedFiles.length > 0 ? `(${stagedFiles.length})` : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
