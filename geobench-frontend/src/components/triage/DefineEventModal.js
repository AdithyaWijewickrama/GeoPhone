import React, { useState, useEffect } from 'react';
import { formatDateTime, toDatetimeLocalString } from '../../utils';
import { API_BASE_URL } from './constants';

export default function DefineEventModal({
    show,
    onClose,
    currentLocation,
    locations = [],
    onOpenLocationModal,
    user,
    onEventCreated,
    eventToEdit = null,
    onDeleteEvent = null
}) {
    const [availableLocations, setAvailableLocations] = useState(locations || []);
    const [defineEventLocationId, setDefineEventLocationId] = useState('');
    const [newEvent, setNewEvent] = useState({ name: '', start: '', end: '', duration: '', note: '' });
    const [defineCollisionWarning, setDefineCollisionWarning] = useState(null);
    const [forceDefineSave, setForceDefineSave] = useState(false);
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const isEditMode = Boolean(eventToEdit && eventToEdit.id);

    // Sync with locations prop when changed
    useEffect(() => {
        if (Array.isArray(locations) && locations.length > 0) {
            setAvailableLocations(locations);
        }
    }, [locations]);

    // Load available locations from API when modal opens
    useEffect(() => {
        if (!show) return;

        let isMounted = true;
        setLoadingLocations(true);

        fetch(`${API_BASE_URL}/api/locations/`)
            .then(res => res.json())
            .then(data => {
                if (isMounted && Array.isArray(data)) {
                    setAvailableLocations(data);
                }
            })
            .catch(err => {
                if (isMounted) console.error("Error loading available locations for known events:", err);
            })
            .finally(() => {
                if (isMounted) setLoadingLocations(false);
            });

        return () => {
            isMounted = false;
        };
    }, [show]);

    // Pre-fill form on open / when eventToEdit changes
    useEffect(() => {
        if (!show) return;

        if (eventToEdit) {
            const startMs = Number(eventToEdit.start_time || eventToEdit.startTime || 0);
            const endMs = Number(eventToEdit.end_time || eventToEdit.endTime || (startMs + 10000));
            const durSec = Math.max(1, Math.round((endMs - startMs) / 1000));

            setNewEvent({
                name: eventToEdit.name || '',
                start: startMs ? toDatetimeLocalString(new Date(startMs)) : '',
                end: endMs ? toDatetimeLocalString(new Date(endMs)) : '',
                duration: String(durSec),
                note: eventToEdit.note || ''
            });
            setDefineEventLocationId(
                eventToEdit.location_id ? String(eventToEdit.location_id) : (currentLocation ? String(currentLocation.id) : '')
            );
        } else {
            setNewEvent({ name: '', start: '', end: '', duration: '', note: '' });
            if (currentLocation) {
                setDefineEventLocationId(String(currentLocation.id));
            } else {
                setDefineEventLocationId('');
            }
        }
        setDefineCollisionWarning(null);
        setForceDefineSave(false);
    }, [show, eventToEdit, currentLocation]);

    if (!show) return null;

    const handleStartChange = (e) => {
        const newStart = e.target.value;
        let updates = { start: newStart };

        if (newStart && newEvent.duration) {
            const endMs = new Date(newStart).getTime() + Number(newEvent.duration) * 1000;
            updates.end = toDatetimeLocalString(new Date(endMs));
        } else if (newStart && newEvent.end) {
            const dur = (new Date(newEvent.end).getTime() - new Date(newStart).getTime()) / 1000;
            updates.duration = dur >= 0 ? dur : '';
        }
        setNewEvent(prev => ({ ...prev, ...updates }));
    };

    const handleEndChange = (e) => {
        const newEnd = e.target.value;
        let updates = { end: newEnd };

        if (newEnd && newEvent.start) {
            const dur = (new Date(newEnd).getTime() - new Date(newEvent.start).getTime()) / 1000;
            updates.duration = dur >= 0 ? dur : '';
        }
        setNewEvent(prev => ({ ...prev, ...updates }));
    };

    const handleDurationChange = (e) => {
        const newDur = e.target.value;
        let updates = { duration: newDur };

        if (newDur && newEvent.start) {
            const endMs = new Date(newEvent.start).getTime() + Number(newDur) * 1000;
            updates.end = toDatetimeLocalString(new Date(endMs));
        }
        setNewEvent(prev => ({ ...prev, ...updates }));
    };

    const handleSaveEvent = async (overrideForce = false) => {
        if (!newEvent.name.trim() || !newEvent.start || !newEvent.end) {
            return alert("Please fill in Event Name, Start Time, and End Time.");
        }

        const start_time = new Date(newEvent.start).getTime();
        const end_time = new Date(newEvent.end).getTime();

        if (end_time <= start_time) {
            return alert("End time must be after Start time.");
        }

        const locId = defineEventLocationId || (currentLocation ? currentLocation.id : null);
        setSaving(true);

        try {
            const url = isEditMode
                ? `${API_BASE_URL}/api/known-events/${eventToEdit.id}/`
                : `${API_BASE_URL}/api/known-events/`;

            const method = isEditMode ? 'PUT' : 'POST';

            const payload = {
                id: isEditMode ? eventToEdit.id : undefined,
                name: newEvent.name.trim(),
                start_time,
                end_time,
                location_id: locId ? parseInt(locId) : null,
                note: newEvent.note,
                force: overrideForce || forceDefineSave,
                user_id: user ? user.id : null
            };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'collision_warning') {
                setDefineCollisionWarning(data);
                setSaving(false);
                return;
            }

            if (!res.ok || data.error) {
                alert(data.error || (isEditMode ? "Failed to update event" : "Failed to create event"));
                setSaving(false);
                return;
            }

            if (onEventCreated) {
                await onEventCreated();
            }

            handleCloseModal();
        } catch (err) {
            console.error(err);
            alert("Error connecting to server.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!eventToEdit || !eventToEdit.id) return;
        if (!window.confirm(`Are you sure you want to delete known event "${eventToEdit.name}"?`)) {
            return;
        }

        setDeleting(true);
        try {
            if (onDeleteEvent) {
                await onDeleteEvent(eventToEdit);
            } else {
                const res = await fetch(`${API_BASE_URL}/api/known-events/${eventToEdit.id}/`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert(data.error || "Failed to delete event");
                    setDeleting(false);
                    return;
                }
                if (onEventCreated) {
                    await onEventCreated();
                }
            }
            handleCloseModal();
        } catch (err) {
            console.error("Error deleting event:", err);
            alert("Error connecting to server.");
        } finally {
            setDeleting(false);
        }
    };

    const handleCloseModal = () => {
        setDefineCollisionWarning(null);
        setForceDefineSave(false);
        setNewEvent({ name: '', start: '', end: '', duration: '', note: '' });
        onClose();
    };

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content bg-dark border-secondary text-light shadow-lg">
                    <div className="modal-header border-secondary">
                        <div className="d-flex align-items-center gap-2">
                            <span>{isEditMode ? '✏️' : '📌'}</span>
                            <h5 className="modal-title text-info mb-0">
                                {isEditMode ? 'Edit Known Event' : 'Define Custom Known Event'}
                            </h5>
                        </div>
                        <button
                            type="button"
                            className="btn-close btn-close-white"
                            onClick={handleCloseModal}
                        ></button>
                    </div>
                    <div className="modal-body">
                        <p className="small text-muted mb-3">
                            {isEditMode
                                ? 'Update properties or time bounds for this registered known event rule.'
                                : 'Define a recurring or verified seismic event rule. Files matching this time window will be grouped into known event chunks in List 2.'}
                        </p>

                        {/* Location Selection for Event */}
                        <div className="mb-3">
                            <div className="d-flex justify-content-between align-items-center mb-1">
                                <label className="form-label text-warning small fw-bold mb-0">Location *</label>
                                {loadingLocations && (
                                    <span className="text-muted small">
                                        <span className="spinner-border spinner-border-sm me-1" role="status" style={{ width: '10px', height: '10px' }}></span>
                                        Loading locations...
                                    </span>
                                )}
                            </div>
                            <div className="input-group input-group-sm">
                                <select
                                    className="form-select bg-dark text-light border-warning"
                                    value={defineEventLocationId}
                                    onChange={(e) => setDefineEventLocationId(e.target.value)}
                                >
                                    <option value="">-- No Location (Global) --</option>
                                    {(availableLocations || []).map(loc => (
                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                    ))}
                                </select>
                                <button
                                    className="btn btn-outline-warning"
                                    type="button"
                                    onClick={onOpenLocationModal}
                                >
                                    + New Location
                                </button>
                            </div>
                        </div>

                        {/* Event Name */}
                        <div className="mb-3">
                            <label className="form-label text-info small fw-bold">Event Name *</label>
                            <input
                                type="text"
                                className="form-control bg-dark text-light border-info"
                                value={newEvent.name}
                                onChange={e => setNewEvent({ ...newEvent, name: e.target.value })}
                                placeholder='e.g. "Controlled Blast", "Freight Train"'
                            />
                        </div>

                        {/* Start Date & Duration */}
                        <div className="row mb-3">
                            <div className="col-md-6">
                                <label className="form-label text-light small">Start Date & Time *</label>
                                <input
                                    type="datetime-local"
                                    step="1"
                                    className="form-control bg-dark text-light border-secondary"
                                    value={newEvent.start}
                                    onChange={handleStartChange}
                                />
                            </div>
                            <div className="col-md-6">
                                <label className="form-label text-light small">Duration (Seconds)</label>
                                <div className="input-group">
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        className="form-control bg-dark text-light border-secondary"
                                        value={newEvent.duration}
                                        onChange={handleDurationChange}
                                        placeholder="e.g. 15"
                                    />
                                    <span className="input-group-text bg-dark text-muted border-secondary">s</span>
                                </div>
                            </div>
                        </div>

                        {/* End Date */}
                        <div className="mb-3">
                            <label className="form-label text-light small">End Date & Time *</label>
                            <input
                                type="datetime-local"
                                step="1"
                                className="form-control bg-dark text-light border-secondary"
                                value={newEvent.end}
                                onChange={handleEndChange}
                            />
                        </div>

                        {/* Optional Note */}
                        <div className="mb-3">
                            <label className="form-label text-light small">Description / Operational Note</label>
                            <textarea
                                rows="2"
                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                placeholder="Details about this seismic event window..."
                                value={newEvent.note}
                                onChange={e => setNewEvent({ ...newEvent, note: e.target.value })}
                            ></textarea>
                        </div>

                        {/* Collision Warning Box */}
                        {defineCollisionWarning && (
                            <div className="alert alert-warning small mb-3">
                                <h6 className="alert-heading fw-bold mb-1">⚠️ Known Event Collision Warning</h6>
                                <p className="mb-1">{defineCollisionWarning.message}</p>
                                <ul className="mb-2">
                                    {defineCollisionWarning.collisions.map((c, i) => (
                                        <li key={i}>
                                            <strong>{c.name}</strong>: {formatDateTime(c.start_time)} - {formatDateTime(c.end_time)}
                                        </li>
                                    ))}
                                </ul>
                                <div className="form-check">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        id="forceDefineCheck"
                                        checked={forceDefineSave}
                                        onChange={e => setForceDefineSave(e.target.checked)}
                                    />
                                    <label className="form-check-label text-light" htmlFor="forceDefineCheck">
                                        I understand. Save overlapping event anyway.
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="d-flex gap-2">
                            {isEditMode && (
                                <button
                                    type="button"
                                    className="btn btn-outline-danger fw-bold"
                                    onClick={handleDelete}
                                    disabled={deleting || saving}
                                >
                                    {deleting ? 'Deleting...' : '🗑️ Delete'}
                                </button>
                            )}
                            <button
                                className="btn btn-info flex-grow-1 fw-bold"
                                onClick={() => handleSaveEvent(forceDefineSave)}
                                disabled={saving || deleting}
                            >
                                {saving ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Save Known Event Rule')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
