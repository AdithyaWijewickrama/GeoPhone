import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
    const navigate = useNavigate();

    const handleLogin = (e) => {
        e.preventDefault();
        // Add authentication logic here later
        navigate('/triage');
    };

    return (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '75vh' }}>
            <div className="card bg-dark border-secondary p-4 shadow" style={{ width: '350px' }}>
                <h3 className="text-center text-warning mb-4">GeoPhone Access</h3>
                <form onSubmit={handleLogin}>
                    <input type="text" className="form-control bg-dark text-light border-secondary mb-3" placeholder="Username" required />
                    <input type="password" className="form-control bg-dark text-light border-secondary mb-4" placeholder="Password" required />
                    <button type="submit" className="btn btn-warning w-100 fw-bold">Login</button>
                </form>
            </div>
        </div>
    );
}