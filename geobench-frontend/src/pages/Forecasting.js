import React, { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../components/triage/constants';

const LABEL_COLORS = [
    '#38bdf8', '#fb7185', '#34d399', '#fbbf24', '#a78bfa',
    '#fb923c', '#2dd4bf', '#e879f9', '#a3e635', '#60a5fa'
];

export const classifyKnn = (samples, duration, peakScore, requestedK = 5) => {
    const validSamples = samples.filter(sample =>
        sample.label && Number.isFinite(sample.duration) && Number.isFinite(sample.peakScore)
    );
    if (!validSamples.length) return null;

    const durationValues = validSamples.map(sample => sample.duration);
    const peakValues = validSamples.map(sample => sample.peakScore);
    const durationRange = Math.max(...durationValues) - Math.min(...durationValues) || 1;
    const peakRange = Math.max(...peakValues) - Math.min(...peakValues) || 1;
    const neighbors = validSamples.map(sample => ({
        ...sample,
        distance: Math.hypot(
            (sample.duration - duration) / durationRange,
            (sample.peakScore - peakScore) / peakRange
        )
    })).sort((a, b) => a.distance - b.distance);
    const k = Math.max(1, Math.min(Math.floor(requestedK) || 1, neighbors.length));
    const nearest = neighbors.slice(0, k);
    const votes = new Map();
    nearest.forEach(sample => {
        const vote = votes.get(sample.label) || { count: 0, distance: 0 };
        vote.count += 1;
        vote.distance += sample.distance;
        votes.set(sample.label, vote);
    });
    const [label, result] = [...votes.entries()].sort((a, b) =>
        b[1].count - a[1].count
        || a[1].distance - b[1].distance
        || a[0].localeCompare(b[0])
    )[0];
    return { label, confidence: result.count / k, k, neighbors: nearest };
};

const createKnnChart = (canvas, samples, prediction, duration, peakScore) => {
    if (!canvas) return null;
    const grouped = new Map();
    samples.forEach(sample => {
        if (!grouped.has(sample.label)) grouped.set(sample.label, []);
        grouped.get(sample.label).push({ x: sample.duration, y: sample.peakScore });
    });

    return new Chart(canvas, {
        type: 'scatter',
        data: {
            datasets: [
                ...[...grouped.entries()].map(([label, data], index) => ({
                    label,
                    data,
                    backgroundColor: LABEL_COLORS[index % LABEL_COLORS.length],
                    borderColor: LABEL_COLORS[index % LABEL_COLORS.length],
                    pointRadius: 5,
                    pointHoverRadius: 7
                })),
                ...(prediction ? [{
                    label: `New event — predicted ${prediction.label}`,
                    data: [{ x: duration, y: peakScore }],
                    backgroundColor: '#ffffff',
                    borderColor: '#facc15',
                    borderWidth: 3,
                    pointStyle: 'star',
                    pointRadius: 10,
                    pointHoverRadius: 12
                }] : [])
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#cbd5e1' } },
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: ${context.parsed.x.toFixed(2)} s, score ${context.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Event duration (seconds)', color: '#cbd5e1' },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Peak anomaly score', color: '#cbd5e1' },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                }
            }
        }
    });
};

/**
 * Renders the forecasting page interface.
 */
export default function Forecasting() {
    const { user } = useAuth();
    const [metadata, setMetadata] = useState(null);
    const [labeledEvents, setLabeledEvents] = useState([]);
    const [labelsLoading, setLabelsLoading] = useState(true);
    const [labelsError, setLabelsError] = useState(null);
    const [duration, setDuration] = useState('');
    const [peakScore, setPeakScore] = useState('');
    const [neighborsCount, setNeighborsCount] = useState(5);
    const knnCanvasRef = useRef(null);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/model-metadata/`).then(res => res.json()).then(setMetadata)
            .catch(() => setMetadata({ trained: false }));
    }, []);

    useEffect(() => {
        let active = true;
        setLabelsLoading(true);
        fetch(`${API_BASE_URL}/api/labels/`)
            .then(async res => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load labeled events.');
                if (!Array.isArray(data)) throw new Error('The labeled events response was invalid.');
                return data;
            })
            .then(data => {
                if (active) {
                    setLabeledEvents(data);
                    setLabelsError(null);
                }
            })
            .catch(error => {
                if (active) setLabelsError(error.message || 'Failed to load labeled events.');
            })
            .finally(() => {
                if (active) setLabelsLoading(false);
            });
        return () => { active = false; };
    }, []);

    const trainingSamples = useMemo(() => labeledEvents
        .map(event => ({
            label: String(event.label || '').trim(),
            duration: Number(event.duration),
            peakScore: Number(event.peak_score)
        }))
        .filter(sample =>
            sample.label
            && Number.isFinite(sample.duration)
            && sample.duration >= 0
            && Number.isFinite(sample.peakScore)
        ), [labeledEvents]);

    const prediction = useMemo(() => {
        const inputDuration = Number(duration);
        const inputPeakScore = Number(peakScore);
        if (duration === '' || peakScore === '' || !Number.isFinite(inputDuration) || inputDuration < 0 || !Number.isFinite(inputPeakScore)) {
            return null;
        }
        return classifyKnn(trainingSamples, inputDuration, inputPeakScore, neighborsCount);
    }, [trainingSamples, duration, peakScore, neighborsCount]);

    useEffect(() => {
        const chart = createKnnChart(
            knnCanvasRef.current,
            trainingSamples,
            prediction,
            Number(duration),
            Number(peakScore)
        );
        return () => chart?.destroy();
    }, [trainingSamples, prediction, duration, peakScore]);

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="text-warning mb-0">ML Forecasting & Analytics</h2>
                    {user && (
                        <small className="text-muted">
                            Active Analyst: <span className="text-info">{user.display_name || user.name || user.username}</span> (ID: #{user.id})
                        </small>
                    )}
                </div>
                <span className={`badge border ${metadata?.trained ? 'bg-success border-success' : 'bg-secondary border-secondary'} text-light`}>Model Status: {metadata?.trained ? 'Trained' : 'Untrained'}</span>
            </div>

            <div className="alert bg-dark border-info text-light shadow-sm" style={{ borderLeft: '4px solid var(--geo-accent-blue)' }}>
                <h5 style={{ color: 'var(--geo-accent-blue)' }}>{metadata?.trained ? 'Latest classifier training run' : 'Supervised model pending'}</h5>
                <p className="mb-0 text-muted">{metadata?.trained ? `Trained ${new Date(metadata.trained_at).toLocaleString()} on ${metadata.row_count} labeled events. Held out: ${metadata.held_out_day || 'none (insufficient distinct days)'}.` : 'Continue labeling events in ML Data Triage. Suggestions appear in the label dialog once a classifier has been trained.'}</p>
            </div>

            <div className="mb-3">
                <h4 className="text-light mb-1">K-Nearest Neighbors Event Prediction</h4>
                <p className="text-muted small mb-0">KNN predicts an event label from duration and peak score using saved labeled anomalies as training samples.</p>
            </div>
            {labelsError && <div className="alert alert-danger" role="alert">{labelsError}</div>}

            <div className="card bg-dark border-secondary shadow mb-4">
                <div className="card-header border-secondary text-info fw-semibold d-flex justify-content-between align-items-center">
                    <span>KNN Training Data & Prediction</span>
                    {trainingSamples.length > 0 && (
                        <span className="badge bg-info text-dark">{trainingSamples.length} Labeled Samples</span>
                    )}
                </div>
                <div className="card-body">
                    <div className="row g-3 align-items-end mb-3">
                        <div className="col-sm-4 col-lg-3">
                            <label className="form-label text-light small" htmlFor="knn-duration">New event duration (seconds)</label>
                            <input
                                id="knn-duration"
                                className="form-control bg-dark text-light border-secondary"
                                type="number"
                                min="0"
                                step="any"
                                value={duration}
                                onChange={event => setDuration(event.target.value)}
                                placeholder="e.g. 2.5"
                            />
                        </div>
                        <div className="col-sm-4 col-lg-3">
                            <label className="form-label text-light small" htmlFor="knn-peak-score">New event peak score</label>
                            <input
                                id="knn-peak-score"
                                className="form-control bg-dark text-light border-secondary"
                                type="number"
                                step="any"
                                value={peakScore}
                                onChange={event => setPeakScore(event.target.value)}
                                placeholder="e.g. 7.2"
                            />
                        </div>
                        <div className="col-sm-4 col-lg-2">
                            <label className="form-label text-light small" htmlFor="knn-k">Neighbors (K)</label>
                            <input
                                id="knn-k"
                                className="form-control bg-dark text-light border-secondary"
                                type="number"
                                min="1"
                                max={Math.max(1, trainingSamples.length)}
                                step="1"
                                value={neighborsCount}
                                onChange={event => setNeighborsCount(Math.max(1, Number(event.target.value) || 1))}
                            />
                        </div>
                    </div>

                    {labelsLoading ? (
                        <div className="text-center text-muted py-5">Loading labeled events…</div>
                    ) : trainingSamples.length === 0 ? (
                        <div className="text-center text-muted py-5">Save labeled events with duration and peak score to train the KNN classifier.</div>
                    ) : (
                        <>
                            {prediction && (
                                <div className="alert alert-info py-2" role="status">
                                    Predicted label: <strong>{prediction.label}</strong>
                                    <span className="ms-2">({(prediction.confidence * 100).toFixed(0)}% of {prediction.k} nearest neighbors)</span>
                                </div>
                            )}
                            <div style={{ height: '400px' }}>
                                <canvas ref={knnCanvasRef} aria-label="KNN training samples and event prediction by duration and peak score" role="img" />
                            </div>

                            <div className="alert bg-dark border-secondary mt-3 mb-0 text-muted small" style={{ borderLeft: '3px solid #cbd5e1' }}>
                                <strong className="text-light">How KNN Works:</strong> This algorithm does not require a pre-compiled model. Instead, it plots all <strong>{trainingSamples.length}</strong> of your manually labeled events based on their Duration (X) and Peak Score (Y).
                                <br/><br/>
                                When you enter new event metrics, the system calculates the geometric distance to all existing points (features are range-normalized so duration and score are weighted equally). The <strong>{neighborsCount}</strong> nearest neighbors "vote" on the classification, and the majority label wins.
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="row mt-4">
                <div className="col-md-8">
                    <div className="card bg-dark border-secondary shadow" style={{ height: '400px' }}>
                        <div className="card-header border-secondary">
                            Validation by class
                        </div>
                        <div className="card-body text-muted">
                            {metadata?.trained && Object.keys(metadata.per_class || {}).length ? <div className="table-responsive"><table className="table table-dark table-sm"><thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>n</th></tr></thead><tbody>{Object.entries(metadata.per_class).map(([label, values]) => <tr key={label}><td>{label}</td><td>{(values.precision * 100).toFixed(1)}%</td><td>{(values.recall * 100).toFixed(1)}%</td><td>{(values.f1 * 100).toFixed(1)}%</td><td>{values.support}</td></tr>)}</tbody></table></div> : <div className="text-center py-5">{metadata ? 'No held-out validation metrics are available yet.' : 'Loading model metadata…'}</div>}
                        </div>
                    </div>
                </div>

                <div className="col-md-4">
                    <div className="card bg-dark border-secondary shadow h-100">
                        <div className="card-header border-secondary">
                            Model Accuracy Metrics
                        </div>
                        <div className="card-body text-muted d-flex flex-column justify-content-center align-items-center">
                            <h1 className="display-4 fw-bold">{metadata?.validation_accuracy == null ? '--' : `${(metadata.validation_accuracy * 100).toFixed(1)}%`}</h1>
                            <p className="small">Grouped validation accuracy</p>
                            <p className="small mb-0">Rockfall recall: {metadata?.hazard_recall?.natural_rockfall == null ? '--' : `${(metadata.hazard_recall.natural_rockfall * 100).toFixed(1)}%`}<br/>Block removal recall: {metadata?.hazard_recall?.block_removal == null ? '--' : `${(metadata.hazard_recall.block_removal * 100).toFixed(1)}%`}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}