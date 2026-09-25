import React, { useEffect, useRef, useState, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { useTheme } from '../../context/ThemeContext';
import { formatDateTime } from '../../utils';

/**
 * Renders the waveform chart, event markers, zoom controls, and drag-selection behavior.
 */
export default function WaveformChart({
    chunk,
    threshold,
    setThreshold,
    onSelectionChange,
    onViewPlot
}) {
    const { theme } = useTheme();
    const chartRef = useRef(null);
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    const startTime = chunk?.startTime || 0;
    const endTime = chunk?.endTime || 0;
    const totalDuration = endTime && startTime ? Math.max(0.1, (endTime - startTime) / 1000) : 60;

    // Time frame / Zoom state in seconds [startSec, endSec]
    const [viewRange, setViewRange] = useState({ start: 0, end: totalDuration });

    // Drag-to-zoom box state
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionBox, setSelectionBox] = useState(null); // { left, width } in px
    const dragStartRef = useRef(null);

    // Reset view range when chunk changes
    useEffect(() => {
        const dur = chunk?.endTime && chunk?.startTime ? Math.max(0.1, (chunk.endTime - chunk.startTime) / 1000) : 60;
        setViewRange({ start: 0, end: dur });
    }, [chunk?.key, chunk?.startTime, chunk?.endTime]);

    const activeStart = Math.max(0, Math.min(viewRange.start, totalDuration - 0.05));
    const activeEnd = Math.min(totalDuration, Math.max(viewRange.end ?? totalDuration, activeStart + 0.05));
    const activeDuration = Math.max(0.05, activeEnd - activeStart);
    const zoomMultiplier = (totalDuration / activeDuration).toFixed(1);

    // Notify parent on active view range change so FlaggedEventsTable can update dynamically
    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange({
                startSec: activeStart,
                endSec: activeEnd,
                startMs: startTime + activeStart * 1000,
                endMs: startTime + activeEnd * 1000,
                isZoomed: activeDuration < totalDuration - 0.1,
                totalDuration
            });
        }
    }, [activeStart, activeEnd, activeDuration, totalDuration, startTime, onSelectionChange]);

    // Zoom action helpers
    /**
     * Restores the chart's full time range.
     */
    const handleResetZoom = useCallback(() => {
        setViewRange({ start: 0, end: totalDuration });
    }, [totalDuration]);

    /**
     * Narrows the visible time range around its midpoint.
     */
    const handleZoomIn = () => {
        const center = (activeStart + activeEnd) / 2;
        const halfSpan = (activeDuration / 2) * 0.65;
        setViewRange({
            start: Math.max(0, center - halfSpan),
            end: Math.min(totalDuration, center + halfSpan)
        });
    };

    /**
     * Widens the visible time range around its midpoint.
     */
    const handleZoomOut = () => {
        const center = (activeStart + activeEnd) / 2;
        const halfSpan = (activeDuration / 2) * 1.5;
        setViewRange({
            start: Math.max(0, center - halfSpan),
            end: Math.min(totalDuration, center + halfSpan)
        });
    };

    /**
     * Sets a preset visible time span around the chart midpoint.
     */
    const handleSelectPreset = (seconds) => {
        const span = Math.min(totalDuration, seconds);
        const center = (activeStart + activeEnd) / 2;
        let s = center - span / 2;
        let e = center + span / 2;
        if (s < 0) {
            s = 0;
            e = span;
        } else if (e > totalDuration) {
            e = totalDuration;
            s = Math.max(0, totalDuration - span);
        }
        setViewRange({ start: s, end: e });
    };

    /**
     * Shifts the visible range by a fraction of its current duration.
     */
    const handlePan = (fraction) => {
        const shift = activeDuration * fraction;
        let s = activeStart + shift;
        let e = activeEnd + shift;
        if (s < 0) {
            s = 0;
            e = activeDuration;
        } else if (e > totalDuration) {
            e = totalDuration;
            s = Math.max(0, totalDuration - activeDuration);
        }
        setViewRange({ start: s, end: e });
    };

    // Canvas Mouse / Drag selection for interactive time frame zoom
    /**
     * Starts waveform drag selection.
     */
    const handleMouseDown = (e) => {
        if (e.button !== 0 || !chartRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        dragStartRef.current = { pixelX: mouseX, clientX: e.clientX };
        setIsSelecting(true);
        setSelectionBox(null);
    };

    /**
     * Updates the active drag-selection endpoint.
     */
    const handleMouseMove = (e) => {
        if (!isSelecting || !dragStartRef.current || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const startX = dragStartRef.current.pixelX;
        const left = Math.min(startX, currentX);
        const width = Math.abs(currentX - startX);

        setSelectionBox({ left, width });
    };

    /**
     * Converts a sufficiently large chart drag into a selected time range.
     */
    const handleMouseUp = (e) => {
        if (!isSelecting || !dragStartRef.current || !chartRef.current) {
            setIsSelecting(false);
            setSelectionBox(null);
            return;
        }

        const chart = chartRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const currentPixelX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const startPixelX = dragStartRef.current.pixelX;
        const distance = Math.abs(currentPixelX - startPixelX);

        // If drag was substantial (> 10 pixels), zoom into selected region
        if (distance > 10 && chart.scales.x) {
            const xScale = chart.scales.x;
            const t1 = xScale.getValueForPixel(Math.min(startPixelX, currentPixelX));
            const t2 = xScale.getValueForPixel(Math.max(startPixelX, currentPixelX));

            if (t1 !== undefined && t2 !== undefined && t2 - t1 >= 0.05) {
                setViewRange({
                    start: Math.max(0, Math.min(t1, totalDuration - 0.05)),
                    end: Math.min(totalDuration, Math.max(t2, t1 + 0.05))
                });
            }
        }

        setIsSelecting(false);
        setSelectionBox(null);
        dragStartRef.current = null;
    };

    // Mouse wheel zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;
            const center = (activeStart + activeEnd) / 2;
            const newHalf = (activeDuration * zoomFactor) / 2;

            if (newHalf >= 0.025 && newHalf <= totalDuration) {
                let s = center - newHalf;
                let endVal = center + newHalf;
                if (s < 0) {
                    s = 0;
                    endVal = Math.min(totalDuration, newHalf * 2);
                } else if (endVal > totalDuration) {
                    endVal = totalDuration;
                    s = Math.max(0, totalDuration - newHalf * 2);
                }
                setViewRange({ start: s, end: endVal });
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [activeStart, activeEnd, activeDuration, totalDuration]);

    // Render Chart.js line graph
    useEffect(() => {
        if (!canvasRef.current || !chunk?.raw) return;

        const ctx = canvasRef.current.getContext('2d');
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const rawTimes = chunk.raw.times || [];
        const rawVolts = chunk.raw.volts || [];
        const rawBlocks = chunk.raw.blocks || [];

        // Build relative seconds timeline from start timestamp
        const startTimestamp = rawTimes.length > 0 ? rawTimes[0] : (chunk.startTime || 0);

        // Filter data points falling inside the active visible view range
        const dataLength = rawTimes.length;
        let step = 1;
        if (dataLength > 3000) {
            step = Math.max(1, Math.floor(dataLength / (activeDuration < totalDuration / 2 ? 3000 : 1500)));
        }

        const filteredWaveform = [];
        for (let i = 0; i < dataLength; i += step) {
            const tMs = rawTimes[i];
            const tSec = (tMs - startTimestamp) / 1000;
            if (tSec >= activeStart - 0.5 && tSec <= activeEnd + 0.5) {
                filteredWaveform.push({ x: tSec, y: rawVolts[i] });
            }
        }

        const filteredScores = [];
        for (let i = 0; i < rawBlocks.length; i++) {
            const b = rawBlocks[i];
            const tSec = (b.time - startTimestamp) / 1000;
            if (tSec >= activeStart - 1.0 && tSec <= activeEnd + 1.0) {
                filteredScores.push({ x: tSec, y: b.score });
            }
        }

        // Theme-aware colors
        const isDark = theme !== 'light';
        const axisColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
        const waveColor = isDark ? '#38bdf8' : '#0284c7';
        const scoreColor = isDark ? '#f87171' : '#dc2626';
        const legendColor = isDark ? '#e2e8f0' : '#1e293b';

        chartRef.current = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Signal (mV)',
                        data: filteredWaveform,
                        borderColor: waveColor,
                        borderWidth: 1.2,
                        pointRadius: 0,
                        tension: 0.1,
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Anomaly Score',
                        data: filteredScores,
                        borderColor: scoreColor,
                        backgroundColor: isDark ? 'rgba(248, 113, 113, 0.2)' : 'rgba(220, 38, 38, 0.15)',
                        borderWidth: 1.5,
                        pointRadius: 1.5,
                        fill: true,
                        tension: 0.2,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: activeStart,
                        max: activeEnd,
                        title: {
                            display: true,
                            text: `Time (seconds from ${formatDateTime(startTime)})`,
                            color: axisColor
                        },
                        ticks: {
                            color: axisColor,
                            callback: (val) => `${Number(val).toFixed(1)}s`
                        },
                        grid: { color: gridColor }
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Signal (mV)', color: waveColor },
                        ticks: { color: axisColor },
                        grid: { color: gridColor }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Score', color: scoreColor },
                        ticks: { color: axisColor },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { display: true, labels: { color: legendColor } },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? `Time: ${Number(items[0].parsed.x).toFixed(2)}s` : ''
                        }
                    }
                }
            }
        });

        return () => chartRef.current?.destroy();
    }, [chunk, threshold, theme, activeStart, activeEnd, activeDuration, startTime, totalDuration]);

    /**
     * Invokes the supplied plot-view callback for the relevant event interval.
     */
    const handleTriggerViewPlot = () => {
        if (!onViewPlot) return;
        const startMs = startTime + activeStart * 1000;
        const endMs = startTime + activeEnd * 1000;
        onViewPlot({
            startTime: startMs,
            endTime: endMs,
            title: `Waveform Window (${activeStart.toFixed(1)}s – ${activeEnd.toFixed(1)}s)`
        });
    };

    return (
        <div className="card bg-dark border-secondary mb-3 shadow-sm">
            {/* Chart Header with Info, Start-End Analyzed Datetime, and Threshold */}
            <div className="card-header border-secondary d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="text-light fw-bold small">Combined Signal Waveform &amp; Detection Anomaly Score</span>
                    <span className="badge bg-secondary bg-opacity-50 text-info border border-secondary" style={{ fontSize: '0.72rem' }}>
                        Window: {activeStart.toFixed(1)}s – {activeEnd.toFixed(1)}s ({activeDuration.toFixed(1)}s, {zoomMultiplier}x zoom)
                    </span>
                </div>

                {/* Analyzed Range Datetime and Threshold */}
                <div className="d-flex align-items-center gap-3 flex-wrap">
                    {startTime > 0 && endTime > 0 && (
                        <div
                            className="badge bg-dark border border-secondary text-light px-2 py-1 d-flex align-items-center gap-1"
                            style={{ fontSize: '0.76rem', backgroundColor: '#101726' }}
                            title="Start and End timestamp of the analyzed dataset"
                        >
                            <span className="text-info">📅 Analyzed Range:</span>
                            <span className="text-warning fw-semibold">{formatDateTime(startTime)}</span>
                            <span className="text-muted">–</span>
                            <span className="text-warning fw-semibold">{formatDateTime(endTime)}</span>
                        </div>
                    )}

                    <div className="d-flex align-items-center gap-2">
                        <label className="text-muted small mb-0 fw-semibold">Threshold:</label>
                        <input
                            type="number"
                            className="form-control form-control-sm bg-dark text-light border-secondary"
                            style={{ width: '75px' }}
                            step="0.5"
                            value={threshold}
                            onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        />
                    </div>
                </div>
            </div>

            {/* Dynamic Waveform Controls: Time Frames, Pan, Zoom, and View Plot Button */}
            <div className="px-3 py-2 border-bottom border-secondary bg-dark bg-opacity-75 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex align-items-center gap-1 flex-wrap">
                    <span className="text-muted small me-1" style={{ fontSize: '0.75rem' }}>Time Frame:</span>
                    <button
                        className={`btn btn-sm py-0 px-2 ${activeDuration >= totalDuration - 0.1 ? 'btn-info text-dark fw-bold' : 'btn-outline-secondary'}`}
                        style={{ fontSize: '0.72rem' }}
                        onClick={handleResetZoom}
                        title="View full chunk"
                    >
                        Full ({totalDuration >= 60 ? `${(totalDuration / 60).toFixed(1)}m` : `${totalDuration.toFixed(0)}s`})
                    </button>
                    {totalDuration >= 10 && (
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => handleSelectPreset(10)}
                            title="Zoom to 10-second window"
                        >
                            10s
                        </button>
                    )}
                    {totalDuration >= 30 && (
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => handleSelectPreset(30)}
                            title="Zoom to 30-second window"
                        >
                            30s
                        </button>
                    )}
                    {totalDuration >= 60 && (
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => handleSelectPreset(60)}
                            title="Zoom to 1-minute window"
                        >
                            1m
                        </button>
                    )}
                    {totalDuration >= 300 && (
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => handleSelectPreset(300)}
                            title="Zoom to 5-minute window"
                        >
                            5m
                        </button>
                    )}

                    <div className="vr bg-secondary mx-1" style={{ height: '16px' }}></div>

                    {/* Navigation / Pan buttons */}
                    <button
                        className="btn btn-outline-secondary btn-sm py-0 px-2"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => handlePan(-0.25)}
                        disabled={activeStart <= 0}
                        title="Pan Left (Shift view earlier)"
                    >
                        ◀ Pan
                    </button>
                    <button
                        className="btn btn-outline-secondary btn-sm py-0 px-2"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => handlePan(0.25)}
                        disabled={activeEnd >= totalDuration}
                        title="Pan Right (Shift view later)"
                    >
                        Pan ▶
                    </button>
                </div>

                <div className="d-flex align-items-center gap-2 flex-wrap">
                    {/* View Spectrogram Plot for active waveform selection */}
                    {onViewPlot && (
                        <button
                            className="btn btn-info btn-sm py-0 px-3 fw-bold text-dark d-flex align-items-center gap-1"
                            style={{ fontSize: '0.75rem' }}
                            onClick={handleTriggerViewPlot}
                            title="View Spectrogram & 3-Panel Plot for current waveform window"
                        >
                            <span>📈</span>
                            <span>View Waveform Plot</span>
                        </button>
                    )}

                    <div className="d-flex align-items-center gap-1">
                        <span className="text-muted small me-1" style={{ fontSize: '0.75rem' }}>Zoom:</span>
                        <button
                            className="btn btn-outline-info btn-sm py-0 px-2 fw-bold"
                            style={{ fontSize: '0.75rem' }}
                            onClick={handleZoomIn}
                            title="Zoom In (+)"
                        >
                            🔍 +
                        </button>
                        <button
                            className="btn btn-outline-info btn-sm py-0 px-2 fw-bold"
                            style={{ fontSize: '0.75rem' }}
                            onClick={handleZoomOut}
                            disabled={activeDuration >= totalDuration - 0.1}
                            title="Zoom Out (-)"
                        >
                            🔍 −
                        </button>
                        <button
                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                            style={{ fontSize: '0.72rem' }}
                            onClick={handleResetZoom}
                            title="Reset Zoom to 100%"
                        >
                            ↺ Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Interactive Canvas Area */}
            <div
                ref={containerRef}
                className="card-body p-2 position-relative user-select-none"
                style={{ height: '350px', cursor: isSelecting ? 'crosshair' : 'crosshair' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleResetZoom}
                title="Click and drag horizontally on the graph to zoom into a custom time frame. Scroll wheel to zoom in/out. Double-click to reset."
            >
                <canvas ref={canvasRef}></canvas>

                {/* Drag-to-zoom Highlight Overlay */}
                {selectionBox && (
                    <div
                        className="position-absolute bg-info bg-opacity-25 border-start border-end border-info"
                        style={{
                            left: `${selectionBox.left + 8}px`,
                            width: `${selectionBox.width}px`,
                            top: '8px',
                            bottom: '8px',
                            pointerEvents: 'none'
                        }}
                    >
                        <div className="badge bg-info text-dark position-absolute top-0 start-50 translate-middle-x mt-1 shadow-sm" style={{ fontSize: '0.65rem' }}>
                            Release to Zoom
                        </div>
                    </div>
                )}
            </div>

            <div className="card-footer border-secondary py-1 px-3 d-flex justify-content-between align-items-center text-muted small" style={{ fontSize: '0.7rem' }}>
                <span>💡 <strong>Tip:</strong> Click &amp; drag on the graph to select a time frame • Scroll wheel to zoom • Double-click to reset</span>
                <span>Total: {totalDuration.toFixed(1)}s</span>
            </div>
        </div>
    );
}
