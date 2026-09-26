import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { DigitalClock } from '@mui/x-date-pickers/DigitalClock';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { API_BASE_URL } from './constants';

const emptyEvent = () => ({
    date: '', time_start: '', time_end: '', time_precision: 'unknown', event_type: '',
    size_estimate: '', distance_from_sensor_m: '', description: '', notes: '', trust_score: 100,
    location_id: ''
});
const localDateTime = (timestamp, eventDate = '') => {
    if (timestamp === null || timestamp === undefined || timestamp === '') return { date: '', time: '' };
    if (typeof timestamp === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timestamp)) {
        const [hour, minute, second = '00'] = timestamp.split(':');
        return { date: eventDate, time: `${hour.padStart(2, '0')}:${minute}:${second}` };
    }
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return { date: '', time: '' };
    const pad = value => String(value).padStart(2, '0');
    return {
        date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    };
};

/** Creates or edits a dated, categorized known-event record. */
export default function DefineEventModal({
    show, onClose, currentLocation, onEventCreated, eventToEdit = null, onDeleteEvent = null
}) {
    const [event, setEvent] = useState(emptyEvent);
    const [locations, setLocations] = useState([]);
    const [eventTypeOptions, setEventTypeOptions] = useState([]);
    const [collisionWarning, setCollisionWarning] = useState(null);
    const [forceSave, setForceSave] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const isEditMode = Boolean(eventToEdit?.id);

    useEffect(() => {
        if (!show) return undefined;
        let active = true;
        const locationQuery = currentLocation?.id ? `?location_id=${currentLocation.id}` : '';
        fetch(`${API_BASE_URL}/api/known-events/${locationQuery}`)
            .then(response => {
                if (!response.ok) throw new Error(`Known events request failed (HTTP ${response.status}).`);
                return response.json();
            })
            .then(data => {
                if (!active || !Array.isArray(data)) return;
                const knownTypes = data.map(item => item.event_type).filter(Boolean);
                const currentType = eventToEdit?.event_type || eventToEdit?.name;
                setEventTypeOptions([...new Set([...knownTypes, currentType].filter(Boolean))].sort());
            })
            .catch(error => {
                if (active) console.error('Error loading known event types:', error);
            });
        return () => { active = false; };
    }, [show, currentLocation?.id, eventToEdit?.event_type, eventToEdit?.name]);

    useEffect(() => {
        let active = true;
        fetch(`${API_BASE_URL}/api/locations/`)
            .then(response => {
                if (!response.ok) throw new Error(`Locations request failed (HTTP ${response.status}).`);
                return response.json();
            })
            .then(data => { if (active && Array.isArray(data)) setLocations(data); })
            .catch(error => console.error('Error loading locations for known events:', error));
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!show) return;
        if (!eventToEdit) {
            setEvent({ ...emptyEvent(), location_id: currentLocation?.id ? String(currentLocation.id) : '' });
        } else {
            const start = localDateTime(eventToEdit.time_start ?? eventToEdit.start_time, eventToEdit.date || '');
            const end = localDateTime(eventToEdit.time_end ?? eventToEdit.end_time, eventToEdit.date || start.date);
            setEvent({
                date: eventToEdit.date || start.date,
                time_start: start.time,
                time_end: end.time,
                time_precision: eventToEdit.time_precision || 'unknown',
                event_type: eventToEdit.event_type || eventToEdit.name || '',
                size_estimate: eventToEdit.size_estimate || '',
                distance_from_sensor_m: eventToEdit.distance_from_sensor_m ?? '',
                description: eventToEdit.description || '',
                notes: eventToEdit.notes || eventToEdit.note || '',
                trust_score: eventToEdit.trust_score ?? 100,
                location_id: eventToEdit.location_id ? String(eventToEdit.location_id) : ''
            });
        }
        setCollisionWarning(null);
        setForceSave(false);
    }, [show, eventToEdit, currentLocation]);

    if (!show) return null;

    const update = (field, value) => setEvent(previous => ({ ...previous, [field]: value }));
    const clockPickerValue = time => time && event.date
        ? dayjs(`${event.date}T${time}`)
        : null;
    const updateClock = (field, value) => update(field, value?.isValid() ? value.format('HH:mm:ss') : '');

    const eventTimestamps = () => {
        const start = new Date(`${event.date}T${event.time_start}`).getTime();
        let end = event.time_end ? new Date(`${event.date}T${event.time_end}`).getTime() : null;
        if (end !== null && end <= start) end += 24 * 60 * 60 * 1000;
        return { start, end };
    };

    const handleSave = async (force = false) => {
        if (!event.date || !event.time_start || !event.event_type.trim()) {
            return alert('Please provide the event date, start time, and event type.');
        }
        const { start, end } = eventTimestamps();
        if (!Number.isFinite(start) || (end !== null && (!Number.isFinite(end) || end <= start))) {
            return alert('Please provide a valid event time interval.');
        }

        const payload = {
            id: isEditMode ? eventToEdit.id : undefined,
            date: event.date,
            time_start: event.time_start,
            time_end: event.time_end || null,
            time_precision: event.time_precision,
            event_type: event.event_type.trim(),
            size_estimate: event.size_estimate,
            distance_from_sensor_m: event.distance_from_sensor_m === '' ? null : Number(event.distance_from_sensor_m),
            description: event.description,
            notes: event.notes,
            trust_score: Number(event.trust_score),
            location_id: event.location_id || null,
            force: force || forceSave
        };

        setSaving(true);
        try {
            const response = await fetch(isEditMode
                ? `${API_BASE_URL}/api/known-events/${eventToEdit.id}/`
                : `${API_BASE_URL}/api/known-events/`, {
                method: isEditMode ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const contentType = response.headers.get('content-type') || '';
            const data = contentType.includes('application/json') ? await response.json() : {};
            if (data.status === 'collision_warning') {
                setCollisionWarning(data);
                return;
            }
            if (!response.ok || data.error) {
                alert(data.error || `Failed to save known event (HTTP ${response.status}).`);
                return;
            }
            await onEventCreated?.();
            handleClose();
        } catch (error) {
            console.error(error);
            alert('Error connecting to server.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!eventToEdit?.id || !window.confirm(`Delete known event "${event.event_type}"?`)) return;
        setDeleting(true);
        try {
            if (onDeleteEvent) await onDeleteEvent(eventToEdit);
            else {
                const response = await fetch(`${API_BASE_URL}/api/known-events/${eventToEdit.id}/`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Failed to delete event.');
                await onEventCreated?.();
            }
            handleClose();
        } catch (error) {
            console.error(error);
            alert(error.message || 'Error connecting to server.');
        } finally {
            setDeleting(false);
        }
    };

    const handleClose = () => {
        setCollisionWarning(null);
        setForceSave(false);
        setEvent(emptyEvent());
        onClose();
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered modal-lg">
                <div className="modal-content bg-dark border-secondary text-light shadow-lg">
                    <div className="modal-header border-secondary">
                        <h5 className="modal-title text-info">{isEditMode ? 'Edit Known Event' : 'Define Known Event'}</h5>
                        <button type="button" className="btn-close btn-close-white" onClick={handleClose} />
                    </div>
                    <div className="modal-body">
                        <div className="row g-3">
                            <div className="col-md-6">
                                <label className="form-label small">Location</label>
                                <select className="form-select bg-dark text-light border-secondary" value={event.location_id} onChange={e => update('location_id', e.target.value)}>
                                    <option value="">No location</option>
                                    {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-4">
                                <label className="form-label small">Date *</label>
                                <DatePicker
                                    value={event.date ? dayjs(event.date) : null}
                                    onChange={value => update('date', value?.isValid() ? value.format('YYYY-MM-DD') : '')}
                                    slotProps={{
                                        textField: {
                                            fullWidth: true,
                                            size: 'small',
                                            sx: {
                                                '& .MuiInputBase-root': { backgroundColor: '#212529', color: '#f8f9fa' },
                                                '& .MuiInputBase-input': { color: '#f8f9fa' },
                                                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#6c757d' },
                                                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#adb5bd' },
                                                '& .MuiSvgIcon-root': { color: '#adb5bd' }
                                            }
                                        }
                                    }}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label small">Start time *</label>
                                <DigitalClock
                                    value={clockPickerValue(event.time_start)}
                                    onChange={value => updateClock('time_start', value)}
                                    ampm={false}
                                    timeStep={5}
                                    sx={{
                                        height: 220,
                                        overflowY: 'auto',
                                        backgroundColor: '#212529',
                                        color: '#f8f9fa',
                                        border: '1px solid #6c757d',
                                        borderRadius: 1,
                                        '& .MuiMenuItem-root': { color: '#f8f9fa' },
                                        '& .MuiMenuItem-root.Mui-selected': { backgroundColor: '#087990', color: '#fff' },
                                        '& .MuiMenuItem-root:hover': { backgroundColor: '#343a40' }
                                    }}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label small d-flex justify-content-between align-items-center">
                                    <span>End time (optional)</span>
                                    {event.time_end && <button type="button" className="btn btn-link btn-sm text-info p-0" onClick={() => update('time_end', '')}>Clear</button>}
                                </label>
                                <DigitalClock
                                    value={clockPickerValue(event.time_end)}
                                    onChange={value => updateClock('time_end', value)}
                                    ampm={false}
                                    timeStep={5}
                                    sx={{
                                        height: 220,
                                        overflowY: 'auto',
                                        backgroundColor: '#212529',
                                        color: '#f8f9fa',
                                        border: '1px solid #6c757d',
                                        borderRadius: 1,
                                        '& .MuiMenuItem-root': { color: '#f8f9fa' },
                                        '& .MuiMenuItem-root.Mui-selected': { backgroundColor: '#087990', color: '#fff' },
                                        '& .MuiMenuItem-root:hover': { backgroundColor: '#343a40' }
                                    }}
                                />
                            </div>
                            <div className="col-md-6">
                                <label className="form-label small">Event type *</label>
                                <input
                                    className="form-control bg-dark text-light border-secondary"
                                    list="known-event-type-options"
                                    value={event.event_type}
                                    onChange={e => update('event_type', e.target.value)}
                                    placeholder="Select or enter an event type"
                                />
                                <datalist id="known-event-type-options">
                                    {eventTypeOptions.map(type => <option key={type} value={type} />)}
                                </datalist>
                            </div>
                            <div className="col-md-6">
                                <label className="form-label small">Time precision</label>
                                <select className="form-select bg-dark text-light border-secondary" value={event.time_precision} onChange={e => update('time_precision', e.target.value)}>
                                    <option value="exact">Exact</option><option value="approx">Approximate</option><option value="range">Range</option><option value="unknown">Unknown</option>
                                </select>
                            </div>
                            <div className="col-md-4">
                                <label className="form-label small">Size estimate</label>
                                <input className="form-control bg-dark text-light border-secondary" value={event.size_estimate} onChange={e => update('size_estimate', e.target.value)} />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label small">Distance from sensor (m)</label>
                                <input type="number" min="0" step="any" className="form-control bg-dark text-light border-secondary" value={event.distance_from_sensor_m} onChange={e => update('distance_from_sensor_m', e.target.value)} />
                            </div>
                            <div className="col-12">
                                <label className="form-label small">Description</label>
                                <textarea rows="2" className="form-control bg-dark text-light border-secondary" value={event.description} onChange={e => update('description', e.target.value)} />
                            </div>
                            <div className="col-12">
                                <label className="form-label small">Notes</label>
                                <textarea rows="2" className="form-control bg-dark text-light border-secondary" value={event.notes} onChange={e => update('notes', e.target.value)} />
                            </div>
                            <div className="col-12">
                                <label className="form-label small d-flex justify-content-between">
                                    <span>Trust score</span><span className="text-warning fw-bold">{event.trust_score}/100</span>
                                </label>
                                <input type="range" className="form-range" min="0" max="100" step="1" value={event.trust_score} onChange={e => update('trust_score', Number(e.target.value))} />
                            </div>
                        </div>

                        {collisionWarning && <div className="alert alert-warning small mt-3">
                            <strong>{collisionWarning.message}</strong>
                            <ul className="mb-2">{collisionWarning.collisions.map(item => <li key={item.id}>{item.event_type || item.name} ({new Date(item.start_time).toLocaleString()} – {item.end_time ? new Date(item.end_time).toLocaleString() : 'end time unknown'})</li>)}</ul>
                            <label className="form-check-label"><input type="checkbox" className="form-check-input me-2" checked={forceSave} onChange={e => setForceSave(e.target.checked)} />Save overlapping event anyway</label>
                        </div>}
                        <div className="d-flex gap-2 mt-3">
                            {isEditMode && <button type="button" className="btn btn-outline-danger" onClick={handleDelete} disabled={deleting || saving}>{deleting ? 'Deleting…' : 'Delete'}</button>}
                            <button type="button" className="btn btn-info flex-grow-1 fw-bold" onClick={() => handleSave(forceSave)} disabled={saving || deleting}>{saving ? 'Saving…' : (isEditMode ? 'Save Changes' : 'Save Known Event')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </LocalizationProvider>
    );
}
