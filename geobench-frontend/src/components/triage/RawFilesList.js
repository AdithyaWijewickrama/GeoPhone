import React, { useState, useMemo, useEffect } from 'react';
import { formatDateTime, getFileDateMs } from '../../utils';

const ROWS_PER_PAGE = 1000;

export default function RawFilesList({
    rawFiles = [],
    showList1 = true,
    setShowList1,
    selectedRawIndices = new Set(),
    setSelectedRawIndices,
    rawSelectionInfo,
    analyzingSelection = false,
    onAnalyzeRawSelection,
    isDraggingRaw,
    setIsDraggingRaw,
    dragRawStart,
    setDragRawStart,
    dragRawDeselect,
    setDragRawDeselect,
    knownEvents = [],
    activeDay,
    setActiveDay,
    activeHour,
    setActiveHour,
    activeMinute,
    setActiveMinute
}) {
    const [rawPage, setRawPage] = useState(0);
    const [localDay, setLocalDay] = useState(null);
    const [localHour, setLocalHour] = useState(null);
    const [localMinute, setLocalMinute] = useState(null);
    const [showDetailedFiles, setShowDetailedFiles] = useState(false);

    const currentDay = activeDay !== undefined ? activeDay : localDay;
    const setCurrentDay = setActiveDay || setLocalDay;

    const currentHour = activeHour !== undefined ? activeHour : localHour;
    const setCurrentHour = setActiveHour || setLocalHour;

    const currentMinute = activeMinute !== undefined ? activeMinute : localMinute;
    const setCurrentMinute = setActiveMinute || setLocalMinute;

    // Helper: Find known events overlapping with a time range [startMs, endMs]
    const getEventsInRange = (startMs, endMs) => {
        if (!knownEvents || knownEvents.length === 0) return [];
        return knownEvents.filter(ev => {
            const evStart = ev.start_time || ev.startTime || 0;
            const evEnd = ev.end_time || ev.endTime || (evStart + 10000);
            return Math.max(startMs, evStart) <= Math.min(endMs, evEnd);
        });
    };

    // Group files by Day (YYYY-MM-DD), Hour (HH:00), and Minute (HH:MM)
    const { daysMap, sortedDays } = useMemo(() => {
        const map = {};

        rawFiles.forEach((file, idx) => {
            const ms = getFileDateMs(file);
            const d = new Date(ms);
            const year = d.getFullYear() < 2000 ? 2026 : d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dayKey = `${year}-${month}-${day}`;
            const hour = String(d.getHours()).padStart(2, '0');
            const hourKey = `${hour}:00`;
            const min = String(d.getMinutes()).padStart(2, '0');
            const minKey = `${hour}:${min}`;

            if (!map[dayKey]) {
                const dayStartMs = new Date(`${dayKey}T00:00:00`).getTime();
                const dayEndMs = dayStartMs + 86400000 - 1;
                map[dayKey] = {
                    day: dayKey,
                    totalFiles: 0,
                    hoursMap: {},
                    fileIndices: [],
                    startMs: dayStartMs,
                    endMs: dayEndMs,
                    knownEvents: getEventsInRange(dayStartMs, dayEndMs)
                };
            }

            map[dayKey].totalFiles += 1;
            map[dayKey].fileIndices.push(idx);

            if (!map[dayKey].hoursMap[hourKey]) {
                const hourStartMs = new Date(`${dayKey}T${hour}:00:00`).getTime();
                const hourEndMs = hourStartMs + 3600000 - 1;
                map[dayKey].hoursMap[hourKey] = {
                    hour: hourKey,
                    fileIndices: [],
                    files: [],
                    minutesMap: {},
                    startMs: hourStartMs,
                    endMs: hourEndMs,
                    knownEvents: getEventsInRange(hourStartMs, hourEndMs)
                };
            }

            map[dayKey].hoursMap[hourKey].fileIndices.push(idx);
            map[dayKey].hoursMap[hourKey].files.push(file);

            if (!map[dayKey].hoursMap[hourKey].minutesMap[minKey]) {
                const minStartMs = new Date(`${dayKey}T${hour}:${min}:00`).getTime();
                const minEndMs = minStartMs + 60000 - 1;
                map[dayKey].hoursMap[hourKey].minutesMap[minKey] = {
                    minute: minKey,
                    fileIndices: [],
                    files: [],
                    startMs: minStartMs,
                    endMs: minEndMs,
                    knownEvents: getEventsInRange(minStartMs, minEndMs)
                };
            }

            map[dayKey].hoursMap[hourKey].minutesMap[minKey].fileIndices.push(idx);
            map[dayKey].hoursMap[hourKey].minutesMap[minKey].files.push(file);
        });

        // Sort days descending (Newest day at top)
        const sorted = Object.keys(map)
            .sort((a, b) => b.localeCompare(a))
            .map(d => map[d]);

        return { daysMap: map, sortedDays: sorted };
    }, [rawFiles, knownEvents]);

    // Active Day
    const activeDayKey = currentDay || sortedDays[0]?.day || '';
    const activeDayData = daysMap[activeDayKey] || sortedDays[0];

    // Synchronize default day on mount or file changes if unset
    useEffect(() => {
        if (!currentDay && sortedDays.length > 0) {
            setCurrentDay(sortedDays[0].day);
        }
    }, [sortedDays, currentDay, setCurrentDay]);

    // Active Hours list
    const currentHours = useMemo(() => {
        if (!activeDayData) return [];
        return Object.keys(activeDayData.hoursMap)
            .sort((a, b) => b.localeCompare(a))
            .map(h => activeDayData.hoursMap[h]);
    }, [activeDayData]);

    // Active Hour
    const activeHourKey = currentHour && activeDayData?.hoursMap[currentHour]
        ? currentHour
        : (currentHours[0]?.hour || '');
    const activeHourData = activeDayData?.hoursMap[activeHourKey] || currentHours[0];

    // Active Minutes list
    const currentMinutes = useMemo(() => {
        if (!activeHourData) return [];
        return Object.keys(activeHourData.minutesMap)
            .sort((a, b) => b.localeCompare(a))
            .map(m => activeHourData.minutesMap[m]);
    }, [activeHourData]);

    // Active Minute
    const activeMinKey = currentMinute && activeHourData?.minutesMap[currentMinute]
        ? currentMinute
        : (currentMinutes[0]?.minute || '');

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

    const handleDayClick = (dayObj) => {
        setCurrentDay(dayObj.day);
        const hours = Object.keys(dayObj.hoursMap).sort((a, b) => b.localeCompare(a));
        if (hours.length > 0) {
            setCurrentHour(hours[0]);
            const mins = Object.keys(dayObj.hoursMap[hours[0]].minutesMap).sort((a, b) => b.localeCompare(a));
            if (mins.length > 0) {
                setCurrentMinute(mins[0]);
            }
        }
    };

    const handleHourClick = (hourObj, e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        setCurrentHour(hourObj.hour);
        const mins = Object.keys(hourObj.minutesMap).sort((a, b) => b.localeCompare(a));
        if (mins.length > 0) {
            setCurrentMinute(mins[0]);
        }
    };

    const handleSelectHourFiles = (hourObj, e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const indices = hourObj.fileIndices;
        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            const allSelected = indices.every(i => next.has(i));
            if (allSelected) {
                indices.forEach(i => next.delete(i));
            } else {
                indices.forEach(i => next.add(i));
            }
            return next;
        });
    };

    const handleMinuteClick = (minObj, e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        setCurrentMinute(minObj.minute);
        const indices = minObj.fileIndices;
        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            const allSelected = indices.every(i => next.has(i));
            if (allSelected) {
                indices.forEach(i => next.delete(i));
            } else {
                indices.forEach(i => next.add(i));
            }
            return next;
        });
    };

    const handleSelectDayFiles = (dayObj, e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const indices = dayObj.fileIndices;
        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            const allSelected = indices.every(i => next.has(i));
            if (allSelected) {
                indices.forEach(i => next.delete(i));
            } else {
                indices.forEach(i => next.add(i));
            }
            return next;
        });
    };

    const handleRawMouseDown = (idx, e) => {
        if (e.button !== 0) return;
        if (setIsDraggingRaw) setIsDraggingRaw(true);
        if (setDragRawStart) setDragRawStart(idx);
        const isCurrentlySelected = selectedRawIndices.has(idx);
        const willDeselect = isCurrentlySelected && !e.shiftKey;
        if (setDragRawDeselect) setDragRawDeselect(willDeselect);

        setSelectedRawIndices(prev => {
            const next = new Set(prev);
            if (e.shiftKey && dragRawStart !== null && dragRawStart !== undefined) {
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
        if (!isDraggingRaw || dragRawStart === null || dragRawStart === undefined) return;
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
                <div className="d-flex align-items-center gap-1">
                    {setShowList1 && (
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-1"
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => setShowList1(!showList1)}
                        >
                            {showList1 ? 'Hide' : 'Show'}
                        </button>
                    )}
                </div>
            </div>

            {showList1 && rawFiles.length > 0 && (
                <div>
                    {/* Range selectors & quick actions */}
                    <div className="d-flex flex-wrap gap-1 mb-2 align-items-center">
                        <button
                            className="btn btn-outline-light btn-sm py-0 px-1"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => handleSelectRawRange(60)}
                            title="Select next 1 minute (approx 60 files)"
                        >
                            +1m
                        </button>
                        <button
                            className="btn btn-outline-light btn-sm py-0 px-1"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => handleSelectRawRange(300)}
                            title="Select next 5 minutes (approx 300 files)"
                        >
                            +5m
                        </button>
                        <button
                            className="btn btn-outline-light btn-sm py-0 px-1"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => handleSelectRawRange(600)}
                            title="Select next 10 minutes (approx 600 files)"
                        >
                            +10m
                        </button>
                        <button
                            className="btn btn-outline-light btn-sm py-0 px-1"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => handleSelectRawRange(1800)}
                            title="Select next 30 minutes (approx 1800 files)"
                        >
                            +30m
                        </button>
                        <button
                            className="btn btn-outline-light btn-sm py-0 px-1"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => {
                                const allIndices = new Set(rawFiles.map((_, i) => i));
                                setSelectedRawIndices(allIndices);
                            }}
                            title="Select All Files"
                        >
                            All
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

                    {/* Days, Hours, and Minutes 3-Column Grouped View */}
                    <div className="d-flex gap-2 mb-2" style={{ minHeight: '210px' }}>
                        {/* 1. Days Column */}
                        <div
                            className="flex-fill rounded p-2 d-flex flex-column shadow-sm"
                            style={{
                                backgroundColor: '#09111e',
                                border: '1px solid #1c2b3f',
                                borderRadius: '8px',
                                minWidth: '110px',
                                width: '33.3%'
                            }}
                        >
                            <div className="d-flex justify-content-between align-items-center pb-2 mb-1 border-bottom border-secondary border-opacity-25">
                                <span className="fw-bold text-light" style={{ fontSize: '0.82rem' }}>Days</span>
                                <span className="small" style={{ fontSize: '0.7rem', color: '#8da4be' }}>
                                    {sortedDays.length}
                                </span>
                            </div>

                            <div className="flex-grow-1 overflow-auto pe-1" style={{ maxHeight: '180px' }}>
                                {sortedDays.map((dayObj) => {
                                    const isDayActive = activeDayKey === dayObj.day;
                                    const hasEvents = dayObj.knownEvents && dayObj.knownEvents.length > 0;
                                    const isDaySelected = dayObj.fileIndices.some(i => selectedRawIndices.has(i));

                                    return (
                                        <div
                                            key={dayObj.day}
                                            className="d-flex justify-content-between align-items-center px-2 py-1 mb-1 rounded cursor-pointer"
                                            style={{
                                                backgroundColor: isDayActive ? '#183354' : isDaySelected ? '#12253d' : 'transparent',
                                                color: isDayActive ? '#ffffff' : '#cbd5e1',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: isDayActive ? '600' : 'normal',
                                                border: hasEvents ? '1px solid #f59e0b55' : '1px solid transparent',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onClick={() => handleDayClick(dayObj)}
                                            onDoubleClick={(e) => handleSelectDayFiles(dayObj, e)}
                                            title={`Click to view hours. Double-click to select all ${dayObj.totalFiles} files.${hasEvents ? `\n📌 ${dayObj.knownEvents.length} Known Event(s)` : ''}`}
                                        >
                                            <div className="d-flex align-items-center gap-1 text-truncate">
                                                {hasEvents && <span title={`${dayObj.knownEvents.length} known events on this day`}>📌</span>}
                                                <span className="text-truncate">{dayObj.day}</span>
                                            </div>
                                            <span style={{ color: isDayActive ? '#93c5fd' : '#8da4be', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                                                {dayObj.totalFiles.toLocaleString()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-1 mt-auto border-top border-secondary border-opacity-25 small" style={{ fontSize: '0.65rem', color: '#71849d' }}>
                                Newest day top
                            </div>
                        </div>

                        {/* 2. Hours Column */}
                        <div
                            className="flex-fill rounded p-2 d-flex flex-column shadow-sm"
                            style={{
                                backgroundColor: '#09111e',
                                border: '1px solid #1c2b3f',
                                borderRadius: '8px',
                                minWidth: '110px',
                                width: '33.3%'
                            }}
                        >
                            <div className="d-flex justify-content-between align-items-center pb-2 mb-1 border-bottom border-secondary border-opacity-25">
                                <span className="fw-bold text-light" style={{ fontSize: '0.82rem' }}>Hours</span>
                                <span className="small" style={{ fontSize: '0.7rem', color: '#8da4be' }}>
                                    {currentHours.length}
                                </span>
                            </div>

                            <div className="flex-grow-1 overflow-auto pe-1" style={{ maxHeight: '180px' }}>
                                {currentHours.length === 0 ? (
                                    <div className="text-center text-muted p-2 small" style={{ fontSize: '0.7rem' }}>
                                        No hours
                                    </div>
                                ) : (
                                    currentHours.map((hourObj) => {
                                        const isHourActive = activeHourKey === hourObj.hour;
                                        const isHourSelected = hourObj.fileIndices.some(i => selectedRawIndices.has(i));
                                        const isAllHourSelected = hourObj.fileIndices.every(i => selectedRawIndices.has(i));
                                        const hasEvents = hourObj.knownEvents && hourObj.knownEvents.length > 0;

                                        return (
                                            <div
                                                key={hourObj.hour}
                                                className="d-flex justify-content-between align-items-center px-2 py-1 mb-1 rounded cursor-pointer"
                                                style={{
                                                    backgroundColor: isHourActive ? '#183354' : isAllHourSelected ? '#162d47' : isHourSelected ? '#112236' : 'transparent',
                                                    color: isHourActive ? '#ffffff' : '#cbd5e1',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: isHourActive ? '600' : 'normal',
                                                    border: hasEvents ? '1px solid #f59e0b55' : '1px solid transparent',
                                                    transition: 'background 0.15s ease'
                                                }}
                                                onClick={(e) => handleHourClick(hourObj, e)}
                                                onDoubleClick={(e) => handleSelectHourFiles(hourObj, e)}
                                                title={`Click to view minutes. Double-click to select all ${hourObj.fileIndices.length} files.${hasEvents ? `\n📌 ${hourObj.knownEvents.length} Known Event(s)` : ''}`}
                                            >
                                                <div className="d-flex align-items-center gap-1 text-truncate">
                                                    {hasEvents && <span title={`${hourObj.knownEvents.length} known events in this hour`}>📌</span>}
                                                    <span>{hourObj.hour}</span>
                                                </div>
                                                <span style={{ color: isHourActive ? '#93c5fd' : '#8da4be', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                                                    {hourObj.fileIndices.length.toLocaleString()}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="pt-1 mt-auto border-top border-secondary border-opacity-25 small text-truncate" style={{ fontSize: '0.65rem', color: '#71849d' }}>
                                {activeDayKey} (newest top)
                            </div>
                        </div>

                        {/* 3. Minutes Column */}
                        <div
                            className="flex-fill rounded p-2 d-flex flex-column shadow-sm"
                            style={{
                                backgroundColor: '#09111e',
                                border: '1px solid #1c2b3f',
                                borderRadius: '8px',
                                minWidth: '110px',
                                width: '33.3%'
                            }}
                        >
                            <div className="d-flex justify-content-between align-items-center pb-2 mb-1 border-bottom border-secondary border-opacity-25">
                                <span className="fw-bold text-light" style={{ fontSize: '0.82rem' }}>Minutes</span>
                                <span className="small" style={{ fontSize: '0.7rem', color: '#8da4be' }}>
                                    {currentMinutes.length}
                                </span>
                            </div>

                            <div className="flex-grow-1 overflow-auto pe-1" style={{ maxHeight: '180px' }}>
                                {currentMinutes.length === 0 ? (
                                    <div className="text-center text-muted p-2 small" style={{ fontSize: '0.7rem' }}>
                                        No minutes
                                    </div>
                                ) : (
                                    currentMinutes.map((minObj) => {
                                        const isMinActive = activeMinKey === minObj.minute;
                                        const isMinSelected = minObj.fileIndices.some(i => selectedRawIndices.has(i));
                                        const isAllMinSelected = minObj.fileIndices.every(i => selectedRawIndices.has(i));
                                        const hasEvents = minObj.knownEvents && minObj.knownEvents.length > 0;

                                        return (
                                            <div
                                                key={minObj.minute}
                                                className="d-flex justify-content-between align-items-center px-2 py-1 mb-1 rounded cursor-pointer"
                                                style={{
                                                    backgroundColor: isAllMinSelected ? '#1e3a5f' : isMinSelected ? '#132842' : isMinActive ? '#183354' : 'transparent',
                                                    color: isMinActive || isMinSelected ? '#ffffff' : '#cbd5e1',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: isMinActive || isMinSelected ? '600' : 'normal',
                                                    border: hasEvents ? '1px solid #f59e0b88' : '1px solid transparent',
                                                    transition: 'background 0.15s ease'
                                                }}
                                                onClick={(e) => handleMinuteClick(minObj, e)}
                                                title={`Click to toggle selection (${minObj.fileIndices.length} files).${hasEvents ? `\n📌 Known: ${minObj.knownEvents.map(e => e.name).join(', ')}` : ''}`}
                                            >
                                                <div className="d-flex align-items-center gap-1 text-truncate">
                                                    {hasEvents && <span title={`Known Event: ${minObj.knownEvents.map(e => e.name).join(', ')}`}>📌</span>}
                                                    <span>{minObj.minute}</span>
                                                </div>
                                                <span style={{ color: isMinSelected ? '#93c5fd' : '#8da4be', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                                                    {minObj.fileIndices.length.toLocaleString()}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="pt-1 mt-auto border-top border-secondary border-opacity-25 small text-truncate" style={{ fontSize: '0.65rem', color: '#71849d' }}>
                                Hour {activeHourKey}
                            </div>
                        </div>
                    </div>

                    {/* Toggle Detailed File List */}
                    <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-muted small" style={{ fontSize: '0.72rem' }}>
                            Individual Files ({rawFiles.length})
                        </span>
                        <button
                            className="btn btn-link btn-sm text-info p-0 text-decoration-none"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => setShowDetailedFiles(!showDetailedFiles)}
                        >
                            {showDetailedFiles ? '▲ Collapse Files' : '▼ Expand Files'}
                        </button>
                    </div>

                    {/* Detailed Raw Files Scroll List (Visible when expanded) */}
                    {showDetailedFiles && (
                        <div>
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

                            <div
                                className="list-group list-group-flush overflow-auto user-select-none"
                                style={{ maxHeight: '160px' }}
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
                                                    {formatDateTime(fileMs).split(' ')[1] || ''}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Hidden selectable items fallback for DOM queries & accessibility */}
                    {!showDetailedFiles && (
                        <div className="d-none">
                            {displayedRawFiles.map((file, localIdx) => {
                                const globalIdx = rawPage * ROWS_PER_PAGE + localIdx;
                                const isSelected = selectedRawIndices.has(globalIdx);
                                return (
                                    <div
                                        key={file.name + '_' + globalIdx}
                                        className={`selectable-item ${isSelected ? 'selected' : ''}`}
                                        onMouseDown={(e) => handleRawMouseDown(globalIdx, e)}
                                    >
                                        {file.name}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
