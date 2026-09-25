import React, { useState, useEffect } from 'react';
import { formatDateTime } from '../../utils';
import { LABEL_OPTIONS, API_BASE_URL } from './constants';

/**
 * Lets the user choose or enter a label and note for selected events and displays collision information.
 */
export default function LabelEventModal({
    show,
    onClose,
    bounds,
    currentLocation,
    onSave
}) {
    const [modalLabel, setModalLabel] = useState(LABEL_OPTIONS[1]);
    const [modalCustomLabel, setModalCustomLabel] = useState('');
    const [modalNote, setModalNote] = useState('');
    const [modalSaveAsKnown, setModalSaveAsKnown] = useState(false);
    const [modalCollisionWarning, setModalCollisionWarning] = useState(null);
    const [checkingCollision, setCheckingCollision] = useState(false);

    // Check collision when opening label modal
    useEffect(() => {
        if (!show || !bounds) return;

        let isMounted = true;
        setCheckingCollision(true);
        setModalCollisionWarning(null);

        fetch(`${API_BASE_URL}/api/known-events/check-collision/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_time: bounds.minStart,
                end_time: bounds.maxEnd,
                location_id: currentLocation ? currentLocation.id : null
            })
        })
            .then(res => res.json())
            .then(data => {
                if (isMounted) {
                    if (data.has_collision && data.collisions && data.collisions.length > 0) {
                        setModalCollisionWarning(data.collisions);
                    } else {
                        setModalCollisionWarning(null);
                    }
                }
            })
            .catch(err => {
                if (isMounted) console.error("Error checking collision:", err);
            })
            .finally(() => {
                if (isMounted) setCheckingCollision(false);
            });

        return () => {
            isMounted = false;
        };
    }, [show, bounds, currentLocation]);

    if (!show || !bounds) return null;

    /**
     * Validates the chosen label and passes the final label/note to the parent callback.
     */
    const handleSave = () => {
        const finalLabel = modalCustomLabel.trim() || modalLabel;
        if (!finalLabel) {
            return alert("Please select or type a label name.");
        }
        onSave({
            finalLabel,
            note: modalNote,
            saveAsKnown: modalSaveAsKnown,
            bounds
        });
        setModalCustomLabel('');
        setModalNote('');
        setModalSaveAsKnown(false);
        setModalCollisionWarning(null);
    };

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1055 }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content bg-dark border-secondary text-light">
                    <div className="modal-header border-secondary">
                        <h5 className="modal-title text-warning">
                            🏷️ Label Selected Event ({bounds.count} row{bounds.count > 1 ? 's' : ''})
                        </h5>
                        <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
                    </div>

                    <div className="modal-body">
                        {/* Fixed Date & Time display */}
                        <div className="card bg-dark border-secondary mb-3 p-3">
                            <h6 className="text-info small fw-bold mb-2">Fixed Date & Time Window</h6>
                            <div className="row g-2 small">
                                <div className="col-6">
                                    <span className="text-muted d-block">Start D&T:</span>
                                    <span className="badge bg-secondary text-light">{bounds.startFormatted}</span>
                                </div>
                                <div className="col-6">
                                    <span className="text-muted d-block">End D&T:</span>
                                    <span className="badge bg-secondary text-light">{bounds.endFormatted}</span>
                                </div>
                                <div className="col-12 mt-2">
                                    <span className="text-muted me-2">Total Duration:</span>
                                    <strong className="text-warning">{bounds.durationFormatted}</strong>
                                </div>
                            </div>
                        </div>

                        {/* Label Field */}
                        <div className="mb-3">
                            <label className="form-label text-light small fw-bold">Select Event Classification *</label>
                            <select
                                className="form-select bg-dark text-light border-secondary mb-2"
                                value={modalLabel}
                                onChange={(e) => setModalLabel(e.target.value)}
                            >
                                {LABEL_OPTIONS.filter(o => o).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                placeholder="Or type custom label name..."
                                value={modalCustomLabel}
                                onChange={(e) => setModalCustomLabel(e.target.value)}
                            />
                        </div>

                        {/* Note Field */}
                        <div className="mb-3">
                            <label className="form-label text-light small">Event Note / Annotation</label>
                            <textarea
                                rows="2"
                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                placeholder="Detailed note about signal characteristics, source, etc."
                                value={modalNote}
                                onChange={(e) => setModalNote(e.target.value)}
                            ></textarea>
                        </div>

                        {/* Checkbox: Save as Known Event Rule */}
                        <div className="form-check mb-3">
                            <input
                                type="checkbox"
                                className="form-check-input"
                                id="saveAsKnownCheck"
                                checked={modalSaveAsKnown}
                                onChange={(e) => setModalSaveAsKnown(e.target.checked)}
                            />
                            <label className="form-check-label text-info small" htmlFor="saveAsKnownCheck">
                                📌 Also save as Known Event rule in database (will auto-chunk in future imports)
                            </label>
                        </div>

                        {/* Collision Warning Display */}
                        {checkingCollision && (
                            <div className="text-muted small mb-2">Checking time collision...</div>
                        )}
                        {modalCollisionWarning && modalCollisionWarning.length > 0 && (
                            <div className="alert alert-warning py-2 small mb-3">
                                <strong>⚠️ Collision Warning:</strong>
                                <p className="mb-1">
                                    This time duration collides with {modalCollisionWarning.length} existing known event(s):
                                </p>
                                <ul className="mb-1">
                                    {modalCollisionWarning.map((c, i) => (
                                        <li key={i}>
                                            <strong>{c.name}</strong> ({formatDateTime(c.start_time)} - {formatDateTime(c.end_time)})
                                        </li>
                                    ))}
                                </ul>
                                <small className="text-muted">You may still proceed to save the label.</small>
                            </div>
                        )}

                        <button
                            className="btn btn-warning w-100 fw-bold"
                            onClick={handleSave}
                        >
                            Save Label {modalSaveAsKnown ? '& Known Event' : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
