import React from 'react';
import { formatDuration } from '../../utils';

/**
 * Displays processed chunks and their selection state.
 */
export default function ChunksList({
    chunks,
    selectedChunkKeys,
    setSelectedChunkKeys,
    activeChunkData,
    chunkSelectionInfo,
    analyzingSelection,
    onAnalyzeChunkSelection,
    isDraggingChunks,
    setIsDraggingChunks,
    dragChunkStart,
    setDragChunkStart,
    dragChunkDeselect,
    setDragChunkDeselect
}) {
    // Drag selection for List 2 (Chunks)
    /**
     * Starts or toggles chunk selection, including shift-selection behavior.
     */
    const handleChunkMouseDown = (chunkKey, idx, e) => {
        if (e.button !== 0) return;
        setIsDraggingChunks(true);
        setDragChunkStart(idx);
        const isCurrentlySelected = selectedChunkKeys.has(chunkKey);
        const willDeselect = isCurrentlySelected && !e.shiftKey;
        setDragChunkDeselect(willDeselect);

        setSelectedChunkKeys(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragChunkStart !== null) {
                const [low, high] = [Math.min(dragChunkStart, idx), Math.max(dragChunkStart, idx)];
                for (let i = low; i <= high; i++) {
                    if (chunks[i]) next.add(chunks[i].key);
                }
            } else if (willDeselect) {
                next.delete(chunkKey);
            } else {
                next.add(chunkKey);
            }
            return next;
        });
    };

    /**
     * Extends an active drag selection across chunks.
     */
    const handleChunkMouseEnter = (idx) => {
        if (!isDraggingChunks || dragChunkStart === null) return;
        const [low, high] = [Math.min(dragChunkStart, idx), Math.max(dragChunkStart, idx)];
        setSelectedChunkKeys(prev => {
            const next = new Set(prev);
            for (let i = low; i <= high; i++) {
                if (chunks[i]) {
                    if (dragChunkDeselect) {
                        next.delete(chunks[i].key);
                    } else {
                        next.add(chunks[i].key);
                    }
                }
            }
            return next;
        });
    };

    return (
        <div className="flex-grow-1 d-flex flex-column p-2 overflow-hidden bg-dark">
            <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="text-info fw-bold small">
                    🗂️ List 2: Chunks ({chunks.length})
                </span>
                {selectedChunkKeys.size > 0 && (
                    <div className="d-flex align-items-center gap-1">
                        <span className="badge bg-info text-dark">
                            {selectedChunkKeys.size} selected
                        </span>
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-1"
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => setSelectedChunkKeys(new Set())}
                        >
                            Clear
                        </button>
                    </div>
                )}
            </div>

            {/* Batch Analyze Button for List 2 */}
            {chunkSelectionInfo && (
                <button
                    className="btn btn-info btn-sm w-100 fw-bold mb-2 py-1"
                    onClick={onAnalyzeChunkSelection}
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
    );
}
