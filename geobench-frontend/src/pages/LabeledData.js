import React, { useEffect, useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

export default function LabeledData() {
    const [labels, setLabels] = useState([]);

    useEffect(() => {
        // Fetch labels from Neon Postgres via Django
        fetch(`${API_BASE_URL}/api/labels/`)
            .then(res => res.json())
            .then(data => setLabels(data))
            .catch(err => console.error("Error fetching labels:", err));
    }, []);

    return (
        <div>
            <h2 className="text-warning mb-4">Curated Training Data</h2>
            <div className="card bg-dark border-secondary">
                <div className="card-body p-0">
                    <table className="table table-dark table-hover mb-0">
                        <thead>
                            <tr>
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
                                <tr><td colSpan="6" className="text-center p-4">No labels saved to the database yet.</td></tr>
                            ) : (
                                labels.map((l, i) => (
                                    <tr key={i}>
                                        <td>{l.file_name}</td>
                                        <td>{new Date(l.start_time).toLocaleString()}</td>
                                        <td>{l.duration}s</td>
                                        <td>{l.peak_score}</td>
                                        <td className="text-success fw-bold">{l.label}</td>
                                        <td>{l.note}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}