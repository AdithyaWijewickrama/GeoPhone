import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
// Import page components
import Login from './pages/Login';
import TriageDashboard from './pages/TriageDashboard';
import LabeledData from './pages/LabeledData';
import Forecasting from './pages/Forecasting';
import Documentation from './pages/Documentation';
import LocationModal from './components/LocationModal';

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

function App() {
    const [locations, setLocations] = useState([]);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [showLocationModal, setShowLocationModal] = useState(false);

    // Global triage state
    const [rawFiles, setRawFiles] = useState([]);
    const [chunks, setChunks] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);
    const [labels, setLabels] = useState({});
    const [intervalMins, setIntervalMins] = useState(10);

    // Load locations on mount
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/locations/`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setLocations(data);
                    const savedLocId = localStorage.getItem('geophone_location_id');
                    if (savedLocId) {
                        const found = data.find(l => String(l.id) === String(savedLocId));
                        if (found) setCurrentLocation(found);
                        else if (data.length > 0) setCurrentLocation(data[0]);
                    } else if (data.length > 0) {
                        setCurrentLocation(data[0]);
                    }
                }
            })
            .catch(err => console.error("Error loading locations:", err));
    }, []);

    const handleSelectLocation = (loc) => {
        setCurrentLocation(loc);
        if (loc) {
            localStorage.setItem('geophone_location_id', loc.id);
        } else {
            localStorage.removeItem('geophone_location_id');
        }
    };

    const handleLocationCreated = (newLoc) => {
        setLocations(prev => [newLoc, ...prev.filter(l => l.id !== newLoc.id)]);
    };

    return (
        <Router>
            <div className="min-vh-100 bg-dark text-light">
                {/* Global Navigation Bar */}
                <nav className="navbar navbar-expand-lg navbar-dark border-bottom border-secondary" style={{ backgroundColor: '#16120e' }}>
                    <div className="container-fluid">
                        <Link className="navbar-brand text-warning fw-bold" to="/">GeoPhone Platform</Link>
                        <div className="collapse navbar-collapse">
                            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                                <li className="nav-item">
                                    <Link className="nav-link" to="/triage">ML Data Triage</Link>
                                </li>
                                <li className="nav-item">
                                    <Link className="nav-link" to="/labels">Labeled Data</Link>
                                </li>
                                <li className="nav-item">
                                    <Link className="nav-link" to="/forecast">Forecasting</Link>
                                </li>
                                <li className="nav-item">
                                    <Link className="nav-link text-info" to="/docs">Documentation</Link>
                                </li>
                            </ul>

                            {/* Location Switcher in Navbar */}
                            <div className="d-flex align-items-center gap-2 me-3">
                                <button
                                    className={`btn btn-sm ${currentLocation ? 'btn-outline-warning' : 'btn-warning text-dark fw-bold'} d-flex align-items-center gap-1`}
                                    onClick={() => setShowLocationModal(true)}
                                    title="Click to select or change location"
                                >
                                    <span>📍</span>
                                    <span className="fw-semibold">
                                        {currentLocation ? currentLocation.name : 'Select Location'}
                                    </span>
                                </button>
                            </div>

                            <Link className="btn btn-outline-secondary btn-sm" to="/">Logout</Link>
                        </div>
                    </div>
                </nav>

                {/* Location Modal */}
                <LocationModal
                    show={showLocationModal}
                    onClose={() => setShowLocationModal(false)}
                    locations={locations}
                    currentLocation={currentLocation}
                    onSelectLocation={handleSelectLocation}
                    onLocationCreated={handleLocationCreated}
                />

                {/* Page Routing */}
                <div className="container-fluid py-4">
                    <Routes>
                        <Route path="/" element={<Login />} />
                        <Route path="/triage" element={
                            <TriageDashboard
                                rawFiles={rawFiles} setRawFiles={setRawFiles}
                                chunks={chunks} setChunks={setChunks}
                                selectedKey={selectedKey} setSelectedKey={setSelectedKey}
                                labels={labels} setLabels={setLabels}
                                intervalMins={intervalMins} setIntervalMins={setIntervalMins}
                                currentLocation={currentLocation}
                                locations={locations}
                                onOpenLocationModal={() => setShowLocationModal(true)}
                                onLocationCreated={handleLocationCreated}
                                onSelectLocation={handleSelectLocation}
                            />
                        } />
                        <Route path="/labels" element={
                            <LabeledData
                                currentLocation={currentLocation}
                                locations={locations}
                            />
                        } />
                        <Route path="/forecast" element={<Forecasting />} />
                        <Route path="/docs" element={<Documentation />} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}

export default App;