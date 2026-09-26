import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * Fetches and displays saved labels, with location and user filtering.
 */
export default function LabeledData({ currentLocation, locations }) {
    const { user } = useAuth();
    const [labels, setLabels] = useState([]);
    const [filterLocationId, setFilterLocationId] = useState('');
    const [filterUserId, setFilterUserId] = useState('all');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (currentLocation) {
            setFilterLocationId(String(currentLocation.id));
        } else {
            setFilterLocationId('all');
        }
    }, [currentLocation]);

    /**
     * Requests saved labels using the current location/filter parameters.
     */
    const fetchLabels = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filterLocationId && filterLocationId !== 'all') {
            params.append('location_id', filterLocationId);
        }
        if (filterUserId && filterUserId !== 'all') {
            params.append('user_id', filterUserId);
        }

        const queryStr = params.toString() ? `?${params.toString()}` : '';
        fetch(`${API_BASE_URL}/api/labels/${queryStr}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setLabels(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching labels:", err);
                setLoading(false);
            });
    }, [filterLocationId, filterUserId]);

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

                <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="text-muted small">Location:</span>
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

                    {user && (
                        <>
                            <span className="text-muted small ms-1">User:</span>
                            <select
                                className="form-select form-select-sm bg-dark text-light border-secondary w-auto"
                                value={filterUserId}
                                onChange={(e) => setFilterUserId(e.target.value)}
                            >
                                <option value="all">All Operators</option>
                                <option value={user.id}>Only My Labels (#{user.id})</option>
                            </select>
                        </>
                    )}

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
                                <th>Operator</th>
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
                                    <td colSpan="9" className="text-center p-4 text-muted">
                                        {loading ? 'Loading labels...' : 'No labels found for this filter.'}
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
                                            <td>
                                                {l.user_name ? (
                                                    <span className="badge bg-dark border border-secondary text-info small">
                                                        👤 @{l.user_name}
                                                        {l.user_id && <span className="text-muted ms-1">#{l.user_id}</span>}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted small">System</span>
                                                )}
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