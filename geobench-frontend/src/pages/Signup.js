import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleAuthButton from '../components/GoogleAuthButton';

export default function Signup() {
    const navigate = useNavigate();
    const { signup } = useAuth();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        first_name: '',
        last_name: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.username.trim()) {
            setError('Please enter a username.');
            return;
        }
        if (formData.username.trim().length < 3) {
            setError('Username must be at least 3 characters.');
            return;
        }
        if (!formData.password) {
            setError('Please enter a password.');
            return;
        }
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            await signup({
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password,
                first_name: formData.first_name.trim(),
                last_name: formData.last_name.trim()
            });
            navigate('/triage');
        } catch (err) {
            setError(err.message || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSuccess = () => {
        navigate('/triage');
    };

    const handleGoogleError = (err) => {
        setError(err || 'Google sign-up failed');
    };

    return (
        <div className="d-flex justify-content-center align-items-center py-5">
            <div className="card bg-dark border-secondary p-4 shadow-lg text-light" style={{ width: '450px', maxWidth: '100%' }}>
                <div className="text-center mb-4">
                    <span className="fs-1">📝</span>
                    <h3 className="text-warning fw-bold mt-2 mb-1">Create Account</h3>
                    <p className="text-muted small mb-0">Join GeoPhone ML Triage & Seismic Platform</p>
                </div>

                {error && (
                    <div className="alert alert-danger py-2 small mb-3">
                        {error}
                    </div>
                )}

                {/* Google Sign-Up */}
                <div className="mb-3">
                    <GoogleAuthButton
                        text="Sign up with Google"
                        onSuccess={handleGoogleSuccess}
                        onError={handleGoogleError}
                    />
                </div>

                <div className="d-flex align-items-center my-3">
                    <hr className="flex-grow-1 border-secondary m-0" />
                    <span className="px-3 text-muted small text-uppercase">or register with email</span>
                    <hr className="flex-grow-1 border-secondary m-0" />
                </div>

                <form onSubmit={handleSignup}>
                    <div className="mb-3">
                        <label className="form-label small text-muted">Username *</label>
                        <input
                            type="text"
                            name="username"
                            className="form-control bg-dark text-light border-secondary"
                            placeholder="Choose a username"
                            value={formData.username}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="mb-3">
                        <label className="form-label small text-muted">Email Address</label>
                        <input
                            type="email"
                            name="email"
                            className="form-control bg-dark text-light border-secondary"
                            placeholder="name@example.com"
                            value={formData.email}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="row g-2 mb-3">
                        <div className="col">
                            <label className="form-label small text-muted">First Name</label>
                            <input
                                type="text"
                                name="first_name"
                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                placeholder="First"
                                value={formData.first_name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="col">
                            <label className="form-label small text-muted">Last Name</label>
                            <input
                                type="text"
                                name="last_name"
                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                placeholder="Last"
                                value={formData.last_name}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label className="form-label small text-muted">Password * (min 6 chars)</label>
                        <input
                            type="password"
                            name="password"
                            className="form-control bg-dark text-light border-secondary"
                            placeholder="Create password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="form-label small text-muted">Confirm Password *</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            className="form-control bg-dark text-light border-secondary"
                            placeholder="Confirm password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-warning w-100 fw-bold py-2 mb-3 text-dark d-flex align-items-center justify-content-center gap-2"
                        disabled={loading}
                    >
                        {loading && <div className="spinner-border spinner-border-sm text-dark" role="status"></div>}
                        <span>Create Account</span>
                    </button>
                </form>

                <div className="text-center mt-2 pt-2 border-top border-secondary">
                    <span className="text-muted small">Already have an account? </span>
                    <Link to="/login" className="text-warning small fw-semibold text-decoration-none">
                        Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}
