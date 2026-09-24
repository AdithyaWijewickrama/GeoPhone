import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useTheme } from '../../context/ThemeContext';

export default function WaveformChart({
    chunk,
    threshold,
    setThreshold
}) {
    const { theme } = useTheme();
    const chartRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !chunk?.raw) return;

        if (chartRef.current) chartRef.current.destroy();

        const startTime = chunk.startTime;
        const skip = Math.max(1, Math.floor(chunk.raw.volts.length / 2000));
        const waveData = [];
        for (let i = 0; i < chunk.raw.volts.length; i += skip) {
            waveData.push({ x: (chunk.raw.times[i] - startTime) / 1000, y: chunk.raw.volts[i] });
        }
        const scoreData = chunk.raw.blocks.map(b => ({ x: (b.time - startTime) / 1000, y: b.score }));
        const xMax = (chunk.endTime - startTime) / 1000;

        const isModernDark = theme === 'modern-dark';
        const isModernWhite = theme === 'modern-white';

        const voltColor = isModernDark ? '#38bdf8' : isModernWhite ? '#0284c7' : '#348abd';
        const scoreColor = isModernDark ? '#f43f5e' : isModernWhite ? '#ea580c' : '#d9604a';
        const threshColor = isModernDark ? '#94a3b8' : isModernWhite ? '#64748b' : '#9c9080';
        const axisColor = isModernDark ? '#94a3b8' : isModernWhite ? '#64748b' : '#9c9080';
        const gridColor = isModernDark ? 'rgba(255, 255, 255, 0.08)' : isModernWhite ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)';
        const legendColor = isModernDark ? '#f8fafc' : isModernWhite ? '#0f172a' : '#ece5d6';

        chartRef.current = new Chart(canvasRef.current, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Voltage (mV)',
                        data: waveData,
                        yAxisID: 'y',
                        borderColor: voltColor,
                        borderWidth: 1,
                        pointRadius: 0,
                        tension: 0
                    },
                    {
                        label: 'Anomaly Score',
                        data: scoreData,
                        yAxisID: 'y1',
                        borderColor: scoreColor,
                        borderDash: [4, 3],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.1
                    },
                    {
                        label: 'Threshold',
                        data: [{ x: 0, y: threshold }, { x: xMax, y: threshold }],
                        yAxisID: 'y1',
                        borderColor: threshColor,
                        borderDash: [2, 2],
                        borderWidth: 1,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time in Chunk (seconds)', color: axisColor },
                        ticks: { color: axisColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Raw Voltage (mV)', color: voltColor },
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
                    legend: { display: true, labels: { color: legendColor } }
                }
            }
        });

        return () => chartRef.current?.destroy();
    }, [chunk, threshold, theme]);

    return (
        <div className="card bg-dark border-secondary mb-3">
            <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                <span className="text-muted small">Combined Signal Waveform & Detection Anomaly Score</span>
                <div className="d-flex align-items-center gap-2">
                    <label className="text-muted small mb-0">Threshold:</label>
                    <input
                        type="number"
                        className="form-control form-control-sm bg-dark text-light border-secondary"
                        style={{ width: '70px' }}
                        step="0.5"
                        value={threshold}
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    />
                </div>
            </div>
            <div className="card-body" style={{ height: '350px' }}>
                <canvas ref={canvasRef}></canvas>
            </div>
        </div>
    );
}
