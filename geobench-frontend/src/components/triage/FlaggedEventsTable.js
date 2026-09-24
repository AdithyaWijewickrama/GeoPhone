import React from 'react';
import { formatDateTime, formatDuration } from '../../utils';
import { LABEL_OPTIONS } from './constants';

export default function FlaggedEventsTable({
    currentEvents,
    chunk,
    labels,
    onSaveLabel,
    setLabels,
    selectedTableEvents,
    setSelectedTableEvents,
    onOpenLabelModal,
    onViewPlot,
    isDraggingTable,
    setIsDraggingTable,
    dragTableStart,
    setDragTableStart,
    dragTableDeselect,
    setDragTableDeselect
}) {
    // Table selection drag handlers
    const handleTableMouseDown = (idx, e) => {
        if (e.button !== 0) return;
        setIsDraggingTable(true);
        setDragTableStart(idx);
        const isCurrentlySelected = selectedTableEvents.has(idx);
        const willDeselect = isCurrentlySelected && !e.shiftKey;
        setDragTableDeselect(willDeselect);

        setSelectedTableEvents(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragTableStart !== null) {
                const [low, high] = [Math.min(dragTableStart, idx), Math.max(dragTableStart, idx)];
                for (let i = low; i <= high; i++) next.add(i);
            } else if (willDeselect) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    };

    const handleTableMouseEnter = (idx) => {
        if (!isDraggingTable || dragTableStart === null) return;
        const [low, high] = [Math.min(dragTableStart, idx), Math.max(dragTableStart, idx)];
        setSelectedTableEvents(prev => {
            const next = new Set(prev);
            for (let i = low; i <= high; i++) {
                if (dragTableDeselect) {
                    next.delete(i);
                } else {
                    next.add(i);
                }
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedTableEvents.size > 0) {
            setSelectedTableEvents(new Set());
        } else {
            setSelectedTableEvents(new Set(currentEvents.map((_, i) => i)));
        }
    };

    return (
        <div className="card bg-dark border-secondary">
            <div className="card-header border-secondary text-muted small d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span className="d-flex align-items-center">
                    Flagged Events ({currentEvents.length})
                    {selectedTableEvents.size > 0 && (
                        <>
                            <span className="text-warning ms-2">({selectedTableEvents.size} rows selected)</span>
                            <button
                                className="btn btn-outline-secondary btn-sm py-0 px-2 ms-2"
                                style={{ fontSize: '0.75rem' }}
                                onClick={() => setSelectedTableEvents(new Set())}
                            >
                                Deselect All
                            </button>
                        </>
                    )}
                </span>

                {/* Label Event Button (enabled only if at least 1 row selected) */}
                <button
                    className="btn btn-warning btn-sm fw-bold px-3 d-flex align-items-center gap-1"
                    disabled={selectedTableEvents.size === 0}
                    onClick={onOpenLabelModal}
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
                                        <td onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="form-check-input border-secondary bg-dark"
                                                checked={isSelected}
                                                onChange={() => {
                                                    setSelectedTableEvents(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(idx)) next.delete(idx);
                                                        else next.add(idx);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </td>
                                        <td>{idx + 1}</td>
                                        <td>{formatDateTime(ev.startTime)}</td>
                                        <td>{formatDuration(ev.endTime - ev.startTime)}</td>
                                        <td className="text-danger fw-bold">{ev.peakScore.toFixed(1)}</td>
                                        <td onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
                                        <td onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
                                        <td onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="btn btn-outline-info btn-sm py-0 px-2"
                                                style={{ fontSize: '0.75rem' }}
                                                onClick={() => onViewPlot(ev)}
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
    );
}
