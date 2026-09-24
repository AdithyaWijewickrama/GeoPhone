import React, {useState} from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
// Import page components
import Login from './pages/Login';
import TriageDashboard from './pages/TriageDashboard';
import LabeledData from './pages/LabeledData';
import Forecasting from './pages/Forecasting';
import Documentation from './pages/Documentation';

function App() {
    const [chunks, setChunks] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);
    const [labels, setLabels] = useState({});
    const [intervalMins, setIntervalMins] = useState(10);
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
                            <Link className="btn btn-outline-secondary btn-sm" to="/">Logout</Link>
                        </div>
                    </div>
                </nav>

                {/* Page Routing */}
                <div className="container-fluid py-4">
                    <Routes>
                        <Route path="/" element={<Login />} />
                        <Route path="/triage" element={
                            <TriageDashboard
                                chunks={chunks} setChunks={setChunks}
                                selectedKey={selectedKey} setSelectedKey={setSelectedKey}
                                labels={labels} setLabels={setLabels}
                                intervalMins={intervalMins} setIntervalMins={setIntervalMins}
                            />
                        } />
                        <Route path="/labels" element={<LabeledData />} />
                        <Route path="/forecast" element={<Forecasting />} />
                        <Route path="/docs" element={<Documentation />} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}

export default App;