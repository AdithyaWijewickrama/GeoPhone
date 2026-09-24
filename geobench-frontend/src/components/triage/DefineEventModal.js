import React, { useState, useEffect } from 'react';
import { formatDateTime, toDatetimeLocalString } from '../../utils';
import { API_BASE_URL } from './constants';

export default function DefineEventModal({
    show,
    onClose,
    currentLocation,
    locations,
    onOpenLocationModal,
    user,
    onEventCreated
}) {
    const [defineEventLocationId, setDefineEventLocationId] = useState('');
    const [newEvent, setNewEvent] = useState({ name: '', start: '', end: '', duration: '', note: '' });
    const [defineCollisionWarning, setDefineCollisionWarning] = useState(null);
    const [forceDefineSave, setForceDefineSave] = useState(false);

    // Set default define event location when location changes
    useEffect(() => {
        if (currentLocation) {
            setDefineEventLocationId(String(currentLocation.id));
        }
    }, [currentLocation]);

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

    const handleCreateEvent = async (overrideForce = false) => {
        if (!newEvent.name.trim() || !newEvent.start || !newEvent.end) {
            return alert("Please fill in Event Name, Start Time, and End Time.");
        }

        const start_time = new Date(newEvent.start).getTime();
        const end_time = new Date(newEvent.end).getTime();

        if (end_time <= start_time) {
            return alert("End time must be after Start time.");
        }

        const locId = defineEventLocationId || (currentLocation ? currentLocation.id : null);

        try {
            const res = await fetch(`${API_BASE_URL}/api/known-events/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newEvent.name.trim(),
                    start_time,
                    end_time,
                    location_id: locId ? parseInt(locId) : null,
                    note: newEvent.note,
                    force: overrideForce || forceDefineSave,
                    user_id: user ? user.id : null
                })
            });
            const data = await res.json();

            if (data.status === 'collision_warning') {
                setDefineCollisionWarning(data);
                return;
            }

            if (!res.ok || data.error) {
                alert(data.error || "Failed to create event");
                return;
            }

            if (onEventCreated) {
                await onEventCreated();
            }

            onClose();
            setNewEvent({ name: '', start: '', end: '', duration: '', note: '' });
            setDefineCollisionWarning(null);
            setForceDefineSave(false);
        } catch (err) {
            console.error(err);
            alert("Error connecting to server.");
        }
    };

    const handleCloseModal = () => {
        setDefineCollisionWarning(null);
        setForceDefineSave(false);
        onClose();
    };

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content bg-dark border-secondary text-light">
                    <div className="modal-header border-secondary">
                        <h5 className="modal-title text-info">📌 Define Custom Known Event</h5>
                        <button
                            type="button"
                            className="btn-close btn-close-white"
                            onClick={handleCloseModal}
                        ></button>
                    </div>
                    <div className="modal-body">
                        <p className="small text-muted mb-3">
                            Define a recurring or verified seismic event rule. Files matching this time window will be grouped into known event chunks in List 2.
                        </p>

                        {/* Location Selection for Event */}
                        <div className="mb-3">
                            <label className="form-label text-warning small fw-bold">Location *</label>
                            <div className="input-group input-group-sm">
                                <select
                                    className="form-select bg-dark text-light border-warning"
                                    value={defineEventLocationId}
                                    onChange={(e) => setDefineEventLocationId(e.target.value)}
                                >
                                    <option value="">-- No Location (Global) --</option>
                                    {locations.map(loc => (
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

                        <button
                            className="btn btn-info w-100 fw-bold"
                            onClick={() => handleCreateEvent(forceDefineSave)}
                        >
                            Save Known Event Rule
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
