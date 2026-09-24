import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import ThemeSelector from './components/ThemeSelector';



// Import page components
import Login from './pages/Login';
import Signup from './pages/Signup';
import TriageDashboard from './pages/TriageDashboard';
import LabeledData from './pages/LabeledData';
import Forecasting from './pages/Forecasting';
import Documentation from './pages/Documentation';
import LocationModal from './components/LocationModal';
import ProtectedRoute from './components/ProtectedRoute';
import GoogleAuthButton from './components/GoogleAuthButton';

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

function AppContent() {
    const { user, logout, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [locations, setLocations] = useState([]);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [showLocationModal, setShowLocationModal] = useState(false);

    // Global triage state
    const [rawFiles, setRawFiles] = useState([]);
    const [chunks, setChunks] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);
    const [labels, setLabels] = useState({});
    const [intervalMins, setIntervalMins] = useState(10);

    // Load locations on mount or when user changes
    useEffect(() => {
        const userParam = user ? `?user_id=${user.id}` : '';
        fetch(`${API_BASE_URL}/api/locations/${userParam}`)
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
    }, [user]);

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

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const handleNavbarGoogleSuccess = () => {
        // GoogleAuthButton (via AuthContext) already stored the user;
        // Redirect from auth pages to main dashboard
        if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/signup') {
            navigate('/triage');
        }
    };

    const handleNavbarGoogleError = (err) => {
        console.error('Navbar Google sign-in failed:', err);
    };

    const isAuthPage = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/signup';

    return (
        <div className="app-container min-vh-100 bg-dark text-light">
            {/* Global Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-dark border-bottom border-secondary">
                <div className="container-fluid">
                    <Link className="navbar-brand text-warning fw-bold d-flex align-items-center gap-2" to={isAuthenticated ? "/triage" : "/"}>
                        <span>🌐</span>
                        <span>GeoPhone Platform</span>
                    </Link>
                    <div className="collapse navbar-collapse">
                        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                            <li className="nav-item">
                                <Link className={`nav-link ${location.pathname === '/triage' ? 'active text-warning fw-bold' : ''}`} to="/triage">
                                    ML Data Triage
                                </Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${location.pathname === '/labels' ? 'active text-warning fw-bold' : ''}`} to="/labels">
                                    Labeled Data
                                </Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${location.pathname === '/forecast' ? 'active text-warning fw-bold' : ''}`} to="/forecast">
                                    Forecasting
                                </Link>
                            </li>
                            <li className="nav-item">
                                <Link className={`nav-link ${location.pathname === '/docs' ? 'active text-info fw-bold' : 'text-info'}`} to="/docs">
                                    Documentation
                                </Link>
                            </li>
                        </ul>

                        {/* Location Switcher in Navbar */}
                        {!isAuthPage && (
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
                        )}

                        {/* Look & Feel Changer */}
                        <div className="me-3">
                            <ThemeSelector />
                        </div>

                        {/* User Profile / Auth Actions */}
                        {user ? (
                            <div className="d-flex align-items-center gap-2">
                                <div className="d-flex align-items-center gap-2 bg-black bg-opacity-50 px-2 py-1 rounded border border-secondary" title={`Logged in as ${user.username} (ID: ${user.id})`}>
                                    {user.avatar_url ? (
                                        <img
                                            src={user.avatar_url}
                                            alt={user.username}
                                            className="rounded-circle"
                                            style={{ width: '24px', height: '24px', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <div
                                            className="rounded-circle bg-warning text-dark fw-bold d-flex align-items-center justify-content-center small"
                                            style={{ width: '24px', height: '24px', fontSize: '11px' }}
                                        >
                                            {(user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'U')).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="d-flex flex-column" style={{ lineHeight: '1.1' }}>
                                        <span className="text-light small fw-bold">
                                            {user.display_name || user.username}
                                        </span>
                                        <span className="text-warning small" style={{ fontSize: '10px' }}>
                                            ID: #{user.id}
                                        </span>
                                    </div>
                                    {user.is_google && (
                                        <span className="badge bg-secondary text-light small px-1 py-0" style={{ fontSize: '9px' }}>
                                            Google
                                        </span>
                                    )}
                                </div>
                                <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={handleLogout}
                                    title="Sign Out"
                                >
                                    Logout
                                </button>
                            </div>
                        ) : (
                            <div className="d-flex align-items-center gap-2">
                                <GoogleAuthButton
                                    text="Sign in with Google"
                                    compact
                                    onSuccess={handleNavbarGoogleSuccess}
                                    onError={handleNavbarGoogleError}
                                />
                            </div>
                        )}
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
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/triage" element={
                        <ProtectedRoute>
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
                        </ProtectedRoute>
                    } />
                    <Route path="/labels" element={
                        <ProtectedRoute>
                            <LabeledData
                                currentLocation={currentLocation}
                                locations={locations}
                            />
                        </ProtectedRoute>
                    } />
                    <Route path="/forecast" element={
                        <ProtectedRoute>
                            <Forecasting />
                        </ProtectedRoute>
                    } />
                    <Route path="/docs" element={<Documentation />} />
                </Routes>
            </div>
        </div>
    );
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <Router>
                    <AppContent />
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;