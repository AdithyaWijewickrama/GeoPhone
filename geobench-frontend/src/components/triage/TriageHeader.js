import React from 'react';

export default function TriageHeader({
    currentLocation,
    user,
    intervalMins,
    setIntervalMins,
    onOpenLocationModal,
    onOpenDefineModal,
    onFilesSelected,
    fileInputRef,
    folderInputRef,
    onScanAll,
    scanning,
    chunkCount,
    onClear
}) {
    return (
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

                {/* Operator Badge */}
                {user && (
                    <div
                        className="badge bg-secondary bg-opacity-50 text-light px-2 py-1 d-flex align-items-center gap-1 border border-secondary"
                        title={`Operator user account #${user.id}`}
                    >
                        <span>👤</span>
                        <span className="text-info fw-bold">{user.display_name || user.username}</span>
                        <span className="text-muted small">(#{user.id})</span>
                    </div>
                )}
            </div>

            <div className="d-flex flex-wrap align-items-center gap-2">
                <button className="btn btn-outline-info btn-sm fw-bold" onClick={onOpenDefineModal}>
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
                    onChange={onFilesSelected}
                />
                <input
                    type="file"
                    ref={folderInputRef}
                    className="d-none"
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    onChange={onFilesSelected}
                />

                <button
                    className="btn btn-outline-warning btn-sm fw-bold"
                    onClick={onScanAll}
                    disabled={scanning || !chunkCount}
                >
                    {scanning ? 'Scanning...' : 'Scan All Chunks'}
                </button>

                <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={onClear}
                >
                    Clear
                </button>
            </div>
        </header>
    );
}
