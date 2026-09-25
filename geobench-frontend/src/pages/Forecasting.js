import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function Forecasting() {
    const { user } = useAuth();

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
                <span className="badge bg-secondary border border-secondary text-light">Model Status: Untrained</span>
            </div>

            <div className="alert bg-dark border-info text-light shadow-sm" style={{ borderLeft: '4px solid var(--geo-accent-blue)' }}>
                <h5 style={{ color: 'var(--geo-accent-blue)' }}>Supervised Model Pending</h5>
                <p className="mb-0 text-muted">
                    The forecasting module requires a trained machine learning model. Continue labeling events in the <strong>ML Data Triage</strong> tab to build out the dataset. Once enough labeled data is gathered, this dashboard will display live predictive classifications.
                </p>
            </div>

            <div className="row mt-4">
                <div className="col-md-8">
                    <div className="card bg-dark border-secondary shadow" style={{ height: '400px' }}>
                        <div className="card-header border-secondary">
                            Live Classification Stream (Awaiting Model)
                        </div>
                        <div className="card-body d-flex justify-content-center align-items-center text-muted">
                            <div className="text-center">
                                <div className="spinner-border spinner-border-sm text-secondary mb-3" role="status"></div>
                                <div>Awaiting real-time WebSocket connection...</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-md-4">
                    <div className="card bg-dark border-secondary shadow h-100">
                        <div className="card-header border-secondary">
                            Model Accuracy Metrics
                        </div>
                        <div className="card-body text-muted d-flex flex-column justify-content-center align-items-center">
                            <h1 className="display-4 fw-bold opacity-25">--%</h1>
                            <p className="small">F1 Score (Validation)</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}