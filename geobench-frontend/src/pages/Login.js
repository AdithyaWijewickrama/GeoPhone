import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../logo.svg'

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const from = location.state?.from?.pathname || '/triage';

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(identifier, password);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="d-flex justify-content-center align-items-center py-5">
            <div className="card bg-dark border-secondary p-4 shadow-lg text-light" style={{ width: '420px', maxWidth: '100%' }}>
                <div className="text-center mb-4">
                    <img src={logo} alt="" width="32" height="32" className="object-fit-contain" />
                    <h3 className="text-warning fw-bold mt-2 mb-1">GeoPhone Access</h3>
                    <p className="text-muted small mb-0">Sign in to ML Workbench & Seismic Analysis</p>
                </div>

                {error && (
                    <div className="alert alert-danger py-2 small mb-3">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div className="mb-3">
                        <label className="form-label small text-muted">Username or Email</label>
                        <input
                            type="text"
                            className="form-control bg-dark text-light border-secondary"
                            placeholder="Enter username or email"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="form-label small text-muted">Password</label>
                        <input
                            type="password"
                            className="form-control bg-dark text-light border-secondary"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-warning w-100 fw-bold py-2 mb-3 text-dark d-flex align-items-center justify-content-center gap-2"
                        disabled={loading}
                    >
                        {loading && <div className="spinner-border spinner-border-sm text-dark" role="status"></div>}
                        <span>Sign In</span>
                    </button>
                </form>

                <div className="text-center mt-2 pt-2 border-top border-secondary">
                    <span className="text-muted small">Don't have an account? </span>
                    <Link to="/signup" className="text-warning small fw-semibold text-decoration-none">
                        Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
}