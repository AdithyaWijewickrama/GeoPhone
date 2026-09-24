import React, { useState, useMemo } from 'react';
import { formatDateTime, formatDuration, getFileDateMs } from '../../utils';

export default function KnownEventsList({
    knownEvents = [],
    selectedKnownEventId,
    onSelectKnownEvent,
    onOpenDefineEventModal,
    onEditKnownEvent,
    onDeleteKnownEvent,
    onRefreshKnownEvents,
    rawFiles = [],
    loading = false
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [showList2, setShowList2] = useState(true);

    // Filter events by search
    const filteredEvents = useMemo(() => {
        if (!searchQuery.trim()) return knownEvents;
        const q = searchQuery.toLowerCase();
        return knownEvents.filter(ev => {
            const name = (ev.name || '').toLowerCase();
            const note = (ev.note || '').toLowerCase();
            const dateStr = formatDateTime(ev.start_time || ev.startTime).toLowerCase();
            return name.includes(q) || note.includes(q) || dateStr.includes(q);
        });
    }, [knownEvents, searchQuery]);

    // Check raw file coverage for an event
    const getCoverageInfo = (ev) => {
        const startMs = ev.start_time || ev.startTime || 0;
        const endMs = ev.end_time || ev.endTime || (startMs + 10000);
        if (!rawFiles || rawFiles.length === 0) return { count: 0, hasMatch: false };

        let matchCount = 0;
        rawFiles.forEach(file => {
            const fileMs = getFileDateMs(file);
            // File covers interval if within 60s
            if (fileMs >= (startMs - 60000) && fileMs <= (endMs + 60000)) {
                matchCount++;
            }
        });
        return { count: matchCount, hasMatch: matchCount > 0 };
    };

    return (
        <div className="d-flex flex-column h-100 bg-dark border-start border-secondary text-light">
            {/* Header */}
            <div className="p-2 border-bottom border-secondary d-flex justify-content-between align-items-center bg-dark">
                <div className="d-flex align-items-center gap-2">
                    <span style={{ fontSize: '1.1rem' }}>📌</span>
                    <div>
                        <div className="fw-bold small text-warning">
                            List 2: Known Events ({knownEvents.length})
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                            Click an event to jump & select time in List 1
                        </div>
                    </div>
                </div>

                <div className="d-flex align-items-center gap-1">
                    {onRefreshKnownEvents && (
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                            style={{ fontSize: '0.75rem' }}
                            onClick={onRefreshKnownEvents}
                            title="Refresh known events from database"
                        >
                            🔄
                        </button>
                    )}
                    {onOpenDefineEventModal && (
                        <button
                            className="btn btn-warning btn-sm py-0 px-2 fw-bold"
                            style={{ fontSize: '0.75rem' }}
                            onClick={onOpenDefineEventModal}
                            title="Register a new known event"
                        >
                            + Define
                        </button>
                    )}
                    <button
                        className="btn btn-outline-secondary btn-sm py-0 px-1"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setShowList2(!showList2)}
                    >
                        {showList2 ? 'Hide' : 'Show'}
                    </button>
                </div>
            </div>

            {showList2 && (
                <div className="d-flex flex-column flex-grow-1 overflow-hidden">
                    {/* Search bar */}
                    <div className="p-2 border-bottom border-secondary bg-dark bg-opacity-50">
                        <input
                            type="text"
                            className="form-control form-control-sm bg-dark text-light border-secondary"
                            placeholder="🔍 Filter known events by name, date, note..."
                            style={{ fontSize: '0.78rem' }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Events list */}
                    <div className="flex-grow-1 overflow-auto p-2" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                        {loading && (
                            <div className="text-center p-3 text-muted">
                                <div className="spinner-border spinner-border-sm text-warning me-2" role="status"></div>
                                <span style={{ fontSize: '0.8rem' }}>Loading known events...</span>
                            </div>
                        )}

                        {!loading && filteredEvents.length === 0 && (
                            <div className="text-center p-4 text-muted small">
                                {searchQuery ? (
                                    <>No known events matching &quot;{searchQuery}&quot;</>
                                ) : (
                                    <>
                                        No known events registered in the database for this location yet.
                                        <br />
                                        <button
                                            className="btn btn-outline-warning btn-sm mt-2 fw-semibold"
                                            onClick={onOpenDefineEventModal}
                                            style={{ fontSize: '0.75rem' }}
                                        >
                                            + Define Known Event
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {!loading && filteredEvents.map((ev) => {
                            const isSelected = selectedKnownEventId === ev.id;
                            const startMs = ev.start_time || ev.startTime || 0;
                            const endMs = ev.end_time || ev.endTime || (startMs + 10000);
                            const durationMs = ev.duration ? (ev.duration * 1000) : (endMs - startMs);
                            const coverage = getCoverageInfo(ev);

                            return (
                                <div
                                    key={ev.id || `${ev.name}_${startMs}`}
                                    className={`card mb-2 border cursor-pointer transition-all ${
                                        isSelected
                                            ? 'border-warning bg-primary bg-opacity-25'
                                            : 'border-secondary bg-dark'
                                    }`}
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        backgroundColor: isSelected ? '#1e3350' : '#141c2b'
                                    }}
                                    onClick={() => onSelectKnownEvent && onSelectKnownEvent(ev)}
                                    title={`Click to navigate List 1 to ${formatDateTime(startMs)} and load waveform`}
                                >
                                    <div className="card-body p-2">
                                        {/* Name & Badge & Actions */}
                                        <div className="d-flex justify-content-between align-items-start gap-1 mb-1">
                                            <div className="d-flex align-items-center gap-1 flex-wrap" style={{ maxWidth: '70%' }}>
                                                <span className="fw-bold text-light" style={{ fontSize: '0.85rem' }}>
                                                    📌 {ev.name}
                                                </span>
                                                {ev.location_name && (
                                                    <span className="badge bg-secondary bg-opacity-50 text-light" style={{ fontSize: '0.65rem' }}>
                                                        {ev.location_name}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="d-flex align-items-center gap-1">
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-info btn-sm py-0 px-1"
                                                    style={{ fontSize: '0.68rem', lineHeight: '1.2' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onEditKnownEvent) onEditKnownEvent(ev);
                                                        else if (onOpenDefineEventModal) onOpenDefineEventModal(ev);
                                                    }}
                                                    title="Edit this known event"
                                                >
                                                    ✏️ Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-danger btn-sm py-0 px-1"
                                                    style={{ fontSize: '0.68rem', lineHeight: '1.2' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onDeleteKnownEvent) onDeleteKnownEvent(ev);
                                                    }}
                                                    title="Delete this known event"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>

                                        {/* Date/Time and Duration */}
                                        <div className="d-flex flex-wrap justify-content-between align-items-center text-muted mb-1" style={{ fontSize: '0.73rem' }}>
                                            <span className="text-info">
                                                📅 {formatDateTime(startMs)}
                                            </span>
                                            <span className="text-warning">
                                                ⏱️ {formatDuration(durationMs)}
                                            </span>
                                        </div>

                                        {/* Small notes text */}
                                        {ev.note && (
                                            <div
                                                className="text-muted mt-1 p-1 rounded"
                                                style={{
                                                    fontSize: '0.72rem',
                                                    backgroundColor: 'rgba(0,0,0,0.25)',
                                                    borderLeft: '2px solid #f59e0b',
                                                    lineHeight: '1.2'
                                                }}
                                            >
                                                📝 {ev.note}
                                            </div>
                                        )}

                                        {/* Coverage Indicator */}
                                        <div className="d-flex justify-content-between align-items-center mt-2 pt-1 border-top border-secondary border-opacity-25" style={{ fontSize: '0.68rem' }}>
                                            {coverage.hasMatch ? (
                                                <span className="badge bg-success bg-opacity-75 text-light">
                                                    📂 Files Loaded in List 1 ({coverage.count})
                                                </span>
                                            ) : (
                                                <span className="badge bg-secondary bg-opacity-50 text-muted">
                                                    No local files for this time
                                                </span>
                                            )}

                                            <span className="text-warning fw-semibold" style={{ fontSize: '0.7rem' }}>
                                                Select in List 1 ➔
                                            </span>
                                        </div>
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
