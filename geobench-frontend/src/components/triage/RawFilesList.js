import React, { useState } from 'react';
import { formatDateTime, formatDuration, getFileDateMs } from '../../utils';

const ROWS_PER_PAGE = 1000;

export default function RawFilesList({
    rawFiles,
    showList1,
    setShowList1,
    selectedRawIndices,
    setSelectedRawIndices,
    rawSelectionInfo,
    analyzingSelection,
    onAnalyzeRawSelection,
    isDraggingRaw,
    setIsDraggingRaw,
    dragRawStart,
    setDragRawStart,
    dragRawDeselect,
    setDragRawDeselect
}) {
    const [rawPage, setRawPage] = useState(0);

    const totalRawPages = Math.ceil(rawFiles.length / ROWS_PER_PAGE);
    const displayedRawFiles = rawFiles.slice(rawPage * ROWS_PER_PAGE, (rawPage + 1) * ROWS_PER_PAGE);

    const handleSelectRawRange = (count) => {
        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            const start = next.size === 0 ? 0 : Math.max(...Array.from(next)) + 1;
            for (let i = start; i < Math.min(rawFiles.length, start + count); i++) {
                next.add(i);
            }
            return next;
        });
    };

    const handleRawMouseDown = (idx, e) => {
        if (e.button !== 0) return;
        setIsDraggingRaw(true);
        setDragRawStart(idx);
        const isCurrentlySelected = selectedRawIndices.has(idx);
        const willDeselect = isCurrentlySelected && !e.shiftKey;
        setDragRawDeselect(willDeselect);

        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragRawStart !== null) {
                const [low, high] = [Math.min(dragRawStart, idx), Math.max(dragRawStart, idx)];
                for (let i = low; i <= high; i++) next.add(i);
            } else if (willDeselect) {
                next.delete(idx);
            } else {
                next.add(idx);
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
                if (dragRawDeselect) {
                    next.delete(i);
                } else {
                    next.add(i);
                }
            }
            return next;
        });
    };

    return (
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
                            onClick={onAnalyzeRawSelection}
                            disabled={analyzingSelection}
                        >
                            {analyzingSelection
                                ? 'Analyzing...'
                                : `Analyze Selected (${rawSelectionInfo.durationSec}s, ${rawSelectionInfo.count} files)`}
                        </button>
                    )}

                    {/* Page Navigation for Large Raw Lists */}
                    {totalRawPages > 1 && (
                        <div className="d-flex justify-content-between align-items-center mb-1 text-muted small" style={{ fontSize: '0.7rem' }}>
                            <button
                                className="btn btn-outline-secondary btn-sm py-0 px-1"
                                disabled={rawPage === 0}
                                onClick={() => setRawPage(p => p - 1)}
                            >
                                ◀ Prev
                            </button>
                            <span>
                                Page {rawPage + 1} of {totalRawPages}
                            </span>
                            <button
                                className="btn btn-outline-secondary btn-sm py-0 px-1"
                                disabled={rawPage >= totalRawPages - 1}
                                onClick={() => setRawPage(p => p + 1)}
                            >
                                Next ▶
                            </button>
                        </div>
                    )}

                    {/* Raw files scroll list with drag selection */}
                    <div
                        className="list-group list-group-flush overflow-auto user-select-none"
                        style={{ maxHeight: '180px' }}
                    >
                        {displayedRawFiles.map((file, localIdx) => {
                            const globalIdx = rawPage * ROWS_PER_PAGE + localIdx;
                            const isSelected = selectedRawIndices.has(globalIdx);
                            const fileMs = getFileDateMs(file);

                            return (
                                <div
                                    key={file.name + '_' + globalIdx}
                                    className={`list-group-item list-group-item-action bg-dark text-light border-secondary p-1 rounded mb-1 selectable-item ${isSelected ? 'selected' : ''}`}
                                    onMouseDown={(e) => handleRawMouseDown(globalIdx, e)}
                                    onMouseEnter={() => handleRawMouseEnter(globalIdx)}
                                    title={`${file.name}\n${formatDateTime(fileMs)}`}
                                >
                                    <div className="d-flex w-100 justify-content-between align-items-center" style={{ fontSize: '0.75rem' }}>
                                        <span className="text-truncate me-2" style={{ maxWidth: '170px' }}>
                                            {file.name}
                                        </span>
                                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                                            {formatDateTime(fileMs).split(',')[1] || ''}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
