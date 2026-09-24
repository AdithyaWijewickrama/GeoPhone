import React from 'react';
import { formatDateTime, formatDuration } from '../../utils';
import { LABEL_OPTIONS } from './constants';

export default function FlaggedEventsTable({
    currentEvents = [],
    chunk,
    labels = {},
    onSaveLabel,
    setLabels,
    selectedTableEvents = new Set(),
    setSelectedTableEvents,
    onOpenLabelModal,
    onViewPlot,
    isDraggingTable,
    setIsDraggingTable,
    dragTableStart,
    setDragTableStart,
    dragTableDeselect,
    setDragTableDeselect,
    isFilteredByWaveform = false,
    totalUnfilteredCount = 0,
    onResetWaveformFilter
}) {
    // Table selection drag handlers
    const handleTableMouseDown = (idx, e) => {
        if (e.button !== 0) return;
        if (setIsDraggingTable) setIsDraggingTable(true);
        if (setDragTableStart) setDragTableStart(idx);
        const isCurrentlySelected = selectedTableEvents.has(idx);
        const willDeselect = isCurrentlySelected && !e.shiftKey;
        if (setDragTableDeselect) setDragTableDeselect(willDeselect);

        setSelectedTableEvents(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragTableStart !== null && dragTableStart !== undefined) {
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
        if (!isDraggingTable || dragTableStart === null || dragTableStart === undefined) return;
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

    const handleViewPlotSelected = () => {
        if (!onViewPlot) return;
        if (selectedTableEvents.size > 0) {
            const selectedList = Array.from(selectedTableEvents).map(i => currentEvents[i]).filter(Boolean);
            if (!selectedList.length) return;
            const minStart = Math.min(...selectedList.map(e => e.startTime));
            const maxEnd = Math.max(...selectedList.map(e => e.endTime));
            onViewPlot({ startTime: minStart, endTime: maxEnd, title: `Selected Events (${selectedList.length} events)` });
        } else if (currentEvents.length > 0) {
            const minStart = Math.min(...currentEvents.map(e => e.startTime));
            const maxEnd = Math.max(...currentEvents.map(e => e.endTime));
            onViewPlot({ startTime: minStart, endTime: maxEnd, title: `Flagged Events Window (${currentEvents.length} events)` });
        }
    };

    return (
        <div className="card bg-dark border-secondary shadow-sm">
            <div className="card-header border-secondary text-muted small d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex align-items-center flex-wrap gap-2">
                    <span className="text-light fw-semibold">
                        Flagged Events ({currentEvents.length})
                    </span>

                    {/* Waveform Selection Filter Indicator */}
                    {isFilteredByWaveform && (
                        <span className="badge bg-info bg-opacity-25 text-info border border-info d-flex align-items-center gap-1" style={{ fontSize: '0.72rem' }}>
                            <span>🔍 Zoom Filtered ({currentEvents.length} of {totalUnfilteredCount})</span>
                            {onResetWaveformFilter && (
                                <button
                                    className="btn btn-link text-info p-0 ms-1 text-decoration-none fw-bold"
                                    style={{ fontSize: '0.7rem' }}
                                    onClick={onResetWaveformFilter}
                                    title="Reset zoom to view all events"
                                >
                                    ✕ Show All
                                </button>
                            )}
                        </span>
                    )}

                    {selectedTableEvents.size > 0 && (
                        <>
                            <span className="text-warning">({selectedTableEvents.size} selected)</span>
                            <button
                                className="btn btn-outline-secondary btn-sm py-0 px-2"
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => setSelectedTableEvents(new Set())}
                            >
                                Deselect All
                            </button>
                        </>
                    )}
                </div>

                {/* Action Buttons: View Plot & Label Event */}
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-info btn-sm fw-bold px-3 d-flex align-items-center gap-1 text-dark"
                        disabled={selectedTableEvents.size === 0 && currentEvents.length === 0}
                        onClick={handleViewPlotSelected}
                        title={selectedTableEvents.size === 0 ? "View Spectrogram & Plot for visible events" : "View Spectrogram & Plot for selected event(s)"}
                    >
                        <span>📈</span>
                        <span>View Plot {selectedTableEvents.size > 0 ? `(${selectedTableEvents.size})` : ''}</span>
                    </button>

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
            </div>

            <div className="card-body p-0">
                <div className="table-responsive" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    <table className="table table-dark table-striped table-hover mb-0" style={{ fontSize: '0.82rem' }}>
                        <thead className="table-secondary sticky-top" style={{ zIndex: 1 }}>
                            <tr>
                                <th style={{ width: '40px' }} className="text-center">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={currentEvents.length > 0 && selectedTableEvents.size === currentEvents.length}
                                        onChange={handleSelectAll}
                                        title="Select/Deselect all visible events"
                                    />
                                </th>
                                <th>#</th>
                                <th>Start Time</th>
                                <th>Duration</th>
                                <th>Score</th>
                                <th>Label</th>
                                <th>Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentEvents.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center p-4 text-muted">
                                        {isFilteredByWaveform ? (
                                            <>
                                                No events in the selected waveform window.{' '}
                                                {onResetWaveformFilter && (
                                                    <button
                                                        className="btn btn-link btn-sm text-info p-0"
                                                        onClick={onResetWaveformFilter}
                                                    >
                                                        Reset zoom to show all
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            'No events crossed the threshold limit.'
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                currentEvents.map((ev, idx) => {
                                    const isSelected = selectedTableEvents.has(idx);
                                    const labelKey = `${chunk.key}_${ev.startTime}_${ev.endTime}`;
                                    const saved = labels[labelKey] || {};
                                    const durationMs = ev.endTime - ev.startTime;

                                    return (
                                        <tr
                                            key={labelKey}
                                            className={`selectable-row ${isSelected ? 'selected-row' : saved.label ? 'table-success' : ''}`}
                                            onMouseDown={(e) => handleTableMouseDown(idx, e)}
                                            onMouseEnter={() => handleTableMouseEnter(idx)}
                                            onDoubleClick={() => onViewPlot && onViewPlot(ev)}
                                            title="Click to select, double-click to view spectrogram plot"
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td className="text-center" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
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
                                            <td className="text-muted small">{idx + 1}</td>
                                            <td className="font-monospace text-info">
                                                {formatDateTime(ev.startTime)}
                                            </td>
                                            <td className="text-warning">
                                                {formatDuration(durationMs)}
                                            </td>
                                            <td className="fw-bold">{ev.peakScore.toFixed(2)}</td>
                                            <td onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                <select
                                                    className="form-select form-select-sm bg-dark text-light border-secondary"
                                                    style={{ fontSize: '0.78rem', minWidth: '110px' }}
                                                    value={saved.label || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        onSaveLabel(chunk.key, chunk.name, ev, val, saved.note || '');
                                                    }}
                                                >
                                                    <option value="">(None)</option>
                                                    {LABEL_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm bg-dark text-light border-secondary"
                                                    placeholder="Add note..."
                                                    style={{ fontSize: '0.78rem' }}
                                                    value={saved.note || ''}
                                                    onBlur={(e) => {
                                                        if (saved.label) {
                                                            onSaveLabel(chunk.key, chunk.name, ev, saved.label, e.target.value);
                                                        }
                                                    }}
                                                    onChange={(e) => setLabels(prev => ({
                                                        ...prev,
                                                        [labelKey]: { ...saved, note: e.target.value }
                                                    }))}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
