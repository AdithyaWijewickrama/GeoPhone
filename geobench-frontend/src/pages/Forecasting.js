import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../components/triage/constants';

/**
 * Renders the forecasting page interface.
 */
export default function Forecasting() {
    const { user } = useAuth();
    const [metadata, setMetadata] = useState(null);
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/model-metadata/`).then(res => res.json()).then(setMetadata)
            .catch(() => setMetadata({ trained: false }));
    }, []);

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
