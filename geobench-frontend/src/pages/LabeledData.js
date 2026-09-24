import React, { useEffect, useState, useCallback } from 'react';
import { formatDateTime } from '../utils';

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

export default function LabeledData({ currentLocation, locations }) {
    const [labels, setLabels] = useState([]);
    const [filterLocationId, setFilterLocationId] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (currentLocation) {
            setFilterLocationId(String(currentLocation.id));
        } else {
            setFilterLocationId('all');
        }
    }, [currentLocation]);

    const fetchLabels = useCallback(() => {
        setLoading(true);
        const locQuery = filterLocationId && filterLocationId !== 'all' ? `?location_id=${filterLocationId}` : '';
        fetch(`${API_BASE_URL}/api/labels/${locQuery}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setLabels(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching labels:", err);
                setLoading(false);
            });
    }, [filterLocationId]);

    useEffect(() => {
        fetchLabels();
    }, [fetchLabels]);

    return (
        <div className="container-fluid py-2">
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
                <div>
                    <h2 className="text-warning mb-1">Curated Training Data</h2>
                    <p className="text-muted small mb-0">
                        Exportable labeled anomalies for supervised model training.
                    </p>
                </div>

                <div className="d-flex align-items-center gap-2">
                    <span className="text-muted small">Filter Location:</span>
                    <select
                        className="form-select form-select-sm bg-dark text-light border-secondary w-auto"
                        value={filterLocationId}
                        onChange={(e) => setFilterLocationId(e.target.value)}
                    >
                        <option value="all">All Locations</option>
                        {(locations || []).map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>

                    <button
                        className="btn btn-outline-warning btn-sm"
                        onClick={fetchLabels}
                        disabled={loading}
                    >
                        {loading ? 'Refreshing...' : '↻ Refresh'}
                    </button>
                </div>
            </div>

            <div className="card bg-dark border-secondary shadow">
                <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                    <span className="text-light">Saved Event Annotations ({labels.length})</span>
                </div>
                <div className="card-body p-0">
                    <table className="table table-dark table-hover mb-0 align-middle">
                        <thead className="border-bottom border-secondary text-muted small">
                            <tr>
                                <th>#</th>
                                <th>Location</th>
                                <th>File Source</th>
                                <th>Timestamp</th>
                                <th>Duration</th>
                                <th>Peak Score</th>
                                <th>Applied Label</th>
                                <th>Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {labels.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="text-center p-4 text-muted">
                                        {loading ? 'Loading labels...' : 'No labels saved for this location yet.'}
                                    </td>
                                </tr>
                            ) : (
                                labels.map((l, i) => {
                                    const parsedTime = !isNaN(Number(l.start_time))
                                        ? formatDateTime(Number(l.start_time))
                                        : l.start_time;

                                    return (
                                        <tr key={l.id || i}>
                                            <td className="text-muted">{i + 1}</td>
                                            <td>
                                                <span className="badge bg-secondary text-light">
                                                    📍 {l.location_name || 'Unassigned'}
                                                </span>
                                            </td>
                                            <td className="text-truncate" style={{ maxWidth: '200px' }} title={l.file_name}>
                                                {l.file_name}
                                            </td>
                                            <td>{parsedTime}</td>
                                            <td>{l.duration ? `${Number(l.duration).toFixed(1)}s` : '-'}</td>
                                            <td className="text-danger fw-bold">
                                                {l.peak_score ? Number(l.peak_score).toFixed(1) : '-'}
                                            </td>
                                            <td className="text-success fw-bold">{l.label}</td>
                                            <td className="text-muted small">{l.note || '—'}</td>
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