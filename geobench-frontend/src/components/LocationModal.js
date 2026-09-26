import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * Displays available locations and the create/select location interface.
 */
export default function LocationModal({
    show,
    onClose,
    locations,
    currentLocation,
    onSelectLocation,
    onLocationCreated,
    onProceedToFileSelection
}) {
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalLocations, setModalLocations] = useState(locations || []);

    // Sync with locations prop when updated
    useEffect(() => {
        if (Array.isArray(locations) && locations.length > 0) {
            setModalLocations(locations);
        }
    }, [locations]);

    // Fetch latest available locations whenever modal is opened
    useEffect(() => {
        if (!show) return;
        let isMounted = true;
        fetch(`${API_BASE_URL}/api/locations/`)
            .then(res => res.json())
            .then(data => {
                if (isMounted && Array.isArray(data)) {
                    setModalLocations(data);
                }
            })
            .catch(err => {
                if (isMounted) console.error("Error loading locations in modal:", err);
            });
        return () => {
            isMounted = false;
        };
    }, [show]);

    if (!show) return null;

    /**
     * Validates and submits a new location, then updates parent state or reports an error.
     */
    const handleCreateLocation = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Please provide a location name.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_BASE_URL}/api/locations/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    latitude: latitude !== '' ? parseFloat(latitude) : null,
                    longitude: longitude !== '' ? parseFloat(longitude) : null,
                    description: description.trim(),
                    user_id: user ? user.id : null
                })
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to create location');
            }

            onLocationCreated(data);
            onSelectLocation(data);
            setModalLocations(prev => [data, ...prev.filter(l => l.id !== data.id)]);
            setName('');
            setLatitude('');
            setLongitude('');
            setDescription('');

            if (onProceedToFileSelection) {
                onProceedToFileSelection();
            } else {
                onClose();
            }
        } catch (err) {
            setError(err.message || 'Error connecting to server');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Selects a location and invokes the optional continuation callback.
     */
    const handleSelect = (loc) => {
        onSelectLocation(loc);
        if (onProceedToFileSelection) {
            onProceedToFileSelection();
        } else {
            onClose();
        }
    };

    const displayLocations = (modalLocations && modalLocations.length > 0) ? modalLocations : (locations || []);
    const filteredLocations = displayLocations.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.description && l.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1060 }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content bg-dark border-secondary text-light">
                    <div className="modal-header border-secondary">
                        <h5 className="modal-title text-warning">
                            📍 Select or Create Location
                        </h5>
                        <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
                    </div>

                    <div className="modal-body">
                        {error && (
                            <div className="alert alert-danger py-2 small">
                                {error}
                            </div>
                        )}

                        <div className="row g-4">
                            {/* Left: Select existing */}
                            <div className="col-md-6 border-end border-secondary">
                                <h6 className="text-info mb-3">Existing Locations</h6>
                                <input
                                    type="text"
                                    className="form-control form-control-sm bg-dark text-light border-secondary mb-3"
                                    placeholder="Search locations..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />

                                <div className="list-group overflow-auto" style={{ maxHeight: '280px' }}>
                                    {filteredLocations.length === 0 ? (
                                        <div className="text-muted small text-center py-4">
                                            No locations found. Create one on the right.
                                        </div>
                                    ) : (
                                        filteredLocations.map(loc => {
                                            const isSelected = currentLocation && currentLocation.id === loc.id;
                                            return (
                                                <button
                                                    key={loc.id}
                                                    type="button"
                                                    className={`list-group-item list-group-item-action bg-dark text-light border-secondary mb-1 rounded ${isSelected ? 'border-warning border-2 bg-secondary bg-opacity-25' : ''}`}
                                                    onClick={() => handleSelect(loc)}
                                                >
                                                    <div className="d-flex justify-content-between align-items-start">
                                                        <div>
                                                            <strong className="text-light">{loc.name}</strong>
                                                            {loc.user_name && (
                                                                <span className="badge bg-secondary bg-opacity-50 text-muted ms-2 small" style={{ fontSize: '10px' }}>
                                                                    by @{loc.user_name}
                                                                </span>
                                                            )}
                                                            {loc.latitude !== null && loc.longitude !== null && (
                                                                <div className="text-muted small">
                                                                    ({loc.latitude?.toFixed(4)}, {loc.longitude?.toFixed(4)})
                                                                </div>
                                                            )}
                                                            {loc.description && (
                                                                <div className="text-muted small text-truncate" style={{ maxWidth: '200px' }}>
                                                                    {loc.description}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {isSelected ? (
                                                            <span className="badge bg-warning text-dark">Active</span>
                                                        ) : (
                                                            <span className="btn btn-outline-info btn-sm py-0 px-2" style={{ fontSize: '0.75rem' }}>Select</span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Right: Create new */}
                            <div className="col-md-6">
                                <h6 className="text-warning mb-3">Create New Location</h6>
                                <form onSubmit={handleCreateLocation}>
                                    <div className="mb-2">
                                        <label className="form-label small text-muted mb-1">Location Name *</label>
                                        <input
                                            type="text"
                                            className="form-control form-control-sm bg-dark text-light border-secondary"
                                            placeholder="e.g. North Ridge Station"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="row g-2 mb-2">
                                        <div className="col-6">
                                            <label className="form-label small text-muted mb-1">Latitude</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                                placeholder="e.g. 37.7749"
                                                value={latitude}
                                                onChange={(e) => setLatitude(e.target.value)}
                                            />
                                        </div>
                                        <div className="col-6">
                                            <label className="form-label small text-muted mb-1">Longitude</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                                placeholder="e.g. -122.4194"
                                                value={longitude}
                                                onChange={(e) => setLongitude(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label small text-muted mb-1">Description / Notes</label>
                                        <textarea
                                            rows="2"
                                            className="form-control form-control-sm bg-dark text-light border-secondary"
                                            placeholder="Coordinates, sensor type, terrain notes..."
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                        ></textarea>
                                    </div>

                                    <button
                                        type="submit"
                                        className="btn btn-warning btn-sm w-100 fw-bold"
                                        disabled={loading}
                                    >
                                        {loading ? 'Saving...' : 'Save & Proceed to Files'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer border-secondary justify-content-between">
                        <span className="text-muted small">
                            {currentLocation ? `Current: ${currentLocation.name}` : 'No location selected'}
                        </span>
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
