import React, { useState, useEffect } from 'react';
import { getWaveformWindow } from '../../utils';
import { LABEL_OPTIONS, API_BASE_URL } from './constants';

/**
 * Lets the user choose or enter a label and note for selected events.
 */
export default function LabelEventModal({
    show,
    onClose,
    bounds,
    onSave,
    waveform
}) {
    const [modalLabel, setModalLabel] = useState(LABEL_OPTIONS[1]);
    const [modalCustomLabel, setModalCustomLabel] = useState('');
    const [modalNote, setModalNote] = useState('');
    const [modalSaveAsKnown, setModalSaveAsKnown] = useState(false);
    const [suggestion, setSuggestion] = useState(null);
    const [checkingSuggestion, setCheckingSuggestion] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const boundsStart = bounds?.minStart;
    const boundsEnd = bounds?.maxEnd;

    useEffect(() => {
        if (!show || boundsStart == null || boundsEnd == null || !waveform?.times?.length || !waveform?.volts?.length) return;
        let active = true;
        setCheckingSuggestion(true);
        const eventWaveform = getWaveformWindow(waveform.times, waveform.volts, boundsStart, boundsEnd);
        fetch(`${API_BASE_URL}/api/suggest-label/`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...eventWaveform, start_time: boundsStart, end_time: boundsEnd })
        }).then(res => res.json()).then(data => {
            if (!active) return;
            const next = data.suggestion;
            setSuggestion(next || null);
            if (next && LABEL_OPTIONS.includes(next.category)) setModalLabel(next.category);
        }).catch(() => { if (active) setSuggestion(null); })
            .finally(() => { if (active) setCheckingSuggestion(false); });
        return () => { active = false; };
    }, [show, boundsStart, boundsEnd, waveform?.times, waveform?.volts]);

    if (!show || !bounds) return null;

    /**
     * Validates the chosen label and saves it through the parent callback.
     */
    const handleSave = async () => {
        const finalLabel = modalCustomLabel.trim() || modalLabel;
        if (!finalLabel) {
            return alert("Please select or type a label name.");
        }
        setSaving(true);
        setSaveError(null);
        try {
            await onSave({
                finalLabel,
                note: modalNote,
                saveAsKnown: modalSaveAsKnown,
                bounds
            });
            setModalCustomLabel('');
            setModalNote('');
            setModalSaveAsKnown(false);
        } catch (err) {
            setSaveError(err.message || 'Failed to save label. Please try again.');
        } finally {
            setSaving(false);
        }
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
                            {checkingSuggestion && <div className="text-muted small mb-2">Checking for a model suggestion…</div>}
                            {suggestion && <div className="alert alert-info py-2 small">Suggested: <strong>{suggestion.category}</strong> ({(suggestion.confidence * 100).toFixed(1)}% confidence). Please review before saving.</div>}
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

                        {saveError && (
                            <div className="alert alert-danger py-2 small" role="alert">
                                {saveError}
                            </div>
                        )}

                        <button
                            className="btn btn-warning w-100 fw-bold"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : `Save Label ${modalSaveAsKnown ? '& Known Event' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
