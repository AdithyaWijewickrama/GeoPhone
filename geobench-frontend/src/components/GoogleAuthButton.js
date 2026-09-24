import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function GoogleAuthButton({ text = 'Continue with Google', onSuccess, onError }) {
    const { loginWithGoogle } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showDevModal, setShowDevModal] = useState(false);
    const [devEmail, setDevEmail] = useState('');
    const [devName, setDevName] = useState('');
    const googleButtonRef = useRef(null);

    const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

    const handleGoogleResponse = useCallback(async (response) => {
        setLoading(true);
        try {
            const user = await loginWithGoogle({ credential: response.credential });
            if (onSuccess) onSuccess(user);
        } catch (err) {
            if (onError) onError(err.message || 'Google authentication failed');
        } finally {
            setLoading(false);
        }
    }, [loginWithGoogle, onSuccess, onError]);

    useEffect(() => {
        // If Google Identity Services script is available and client ID is provided
        if (window.google?.accounts?.id && googleClientId && googleButtonRef.current) {
            try {
                window.google.accounts.id.initialize({
                    client_id: googleClientId,
                    callback: handleGoogleResponse
                });

                window.google.accounts.id.renderButton(googleButtonRef.current, {
                    theme: 'filled_black',
                    size: 'large',
                    text: text.includes('Sign up') ? 'signup_with' : 'signin_with',
                    shape: 'rectangular',
                    width: '100%'
                });
            } catch (err) {
                console.warn('Google Identity initialization error:', err);
            }
        }
    }, [googleClientId, text, handleGoogleResponse]);

    const handleCustomGoogleClick = async () => {
        if (window.google?.accounts?.id && googleClientId) {
            window.google.accounts.id.prompt();
            return;
        }

        // Development / demonstration Google login fallback
        setShowDevModal(true);
    };

    const handleDevSubmit = async (e) => {
        e.preventDefault();
        const email = devEmail.trim() || 'demo.user@gmail.com';
        const name = devName.trim() || 'Demo Google User';
        const google_id = `google_${Math.abs(email.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))}`;

        setLoading(true);
        setShowDevModal(false);
        try {
            const user = await loginWithGoogle({
                email,
                name,
                google_id,
                picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
            });
            if (onSuccess) onSuccess(user);
        } catch (err) {
            if (onError) onError(err.message || 'Google authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-100">
            {/* GIS Container (if initialized) */}
            <div ref={googleButtonRef} className={googleClientId ? "d-block mb-2" : "d-none"}></div>

            {/* Custom Google Button */}
            {(!googleClientId || !window.google?.accounts?.id) && (
                <button
                    type="button"
                    className="btn btn-outline-light w-100 d-flex align-items-center justify-content-center gap-2 py-2 fw-semibold"
                    onClick={handleCustomGoogleClick}
                    disabled={loading}
                    style={{
                        backgroundColor: '#131314',
                        borderColor: '#8e918f',
                        color: '#e3e3e3'
                    }}
                >
                    {loading ? (
                        <div className="spinner-border spinner-border-sm text-light" role="status"></div>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                            <path fill="none" d="M0 0h48v48H0z"/>
                        </svg>
                    )}
                    <span>{text}</span>
                </button>
            )}

            {/* Quick Google Account Input for Demo/Dev */}
            {showDevModal && (
                <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1070 }}>
                    <div className="modal-dialog modal-dialog-centered modal-sm">
                        <div className="modal-content bg-dark border-secondary text-light">
                            <div className="modal-header border-secondary py-2">
                                <h6 className="modal-title d-flex align-items-center gap-2 text-warning">
                                    <span>Google Account Sign-In</span>
                                </h6>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowDevModal(false)}></button>
                            </div>
                            <form onSubmit={handleDevSubmit}>
                                <div className="modal-body py-3">
                                    <p className="small text-muted mb-3">
                                        Enter your Google account details to authenticate via Google Auth:
                                    </p>
                                    <div className="mb-2">
                                        <label className="form-label small text-muted">Google Email</label>
                                        <input
                                            type="email"
                                            className="form-control form-control-sm bg-dark text-light border-secondary"
                                            placeholder="alex.seismic@gmail.com"
                                            value={devEmail}
                                            onChange={(e) => setDevEmail(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label small text-muted">Full Name (optional)</label>
                                        <input
                                            type="text"
                                            className="form-control form-control-sm bg-dark text-light border-secondary"
                                            placeholder="Alex Seismic"
                                            value={devName}
                                            onChange={(e) => setDevName(e.target.value)}
                                        />
                                    </div>
                                    <div className="d-flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary btn-sm flex-fill"
                                            onClick={() => {
                                                setDevEmail('alex.geophysicist@gmail.com');
                                                setDevName('Dr. Alex Morgan');
                                            }}
                                        >
                                            Use Sample
                                        </button>
                                        <button type="submit" className="btn btn-warning btn-sm flex-fill fw-bold">
                                            Continue
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
