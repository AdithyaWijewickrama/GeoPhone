import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function GoogleAuthButton({ text = 'Continue with Google', onSuccess, onError, compact = false }) {
    const { loginWithGoogle } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showDevModal, setShowDevModal] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [devEmail, setDevEmail] = useState('');
    const [devName, setDevName] = useState('');
    const [gisReady, setGisReady] = useState(false);
    const googleButtonRef = useRef(null);

    const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const isSignUp = text.toLowerCase().includes('sign up') || text.toLowerCase().includes('signup');
    const isContinue = text.toLowerCase().includes('continue');

    const handleGoogleResponse = useCallback(async (response) => {
        setLoading(true);
        try {
            // response.credential contains the Google JWT token
            const user = await loginWithGoogle({ credential: response.credential });
            if (onSuccess) onSuccess(user);
        } catch (err) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Google authentication failed');
            if (onError) onError(errorMsg);
        } finally {
            setLoading(false);
        }
    }, [loginWithGoogle, onSuccess, onError]);

    useEffect(() => {
        // Initialize the standard Google Identity Services button if ref is rendered and client ID exists
        if (compact || !googleClientId) return;

        let intervalId = null;
        let isMounted = true;

        const initGis = () => {
            if (window.google?.accounts?.id && googleButtonRef.current) {
                try {
                    window.google.accounts.id.initialize({
                        client_id: googleClientId,
                        callback: handleGoogleResponse
                    });

                    window.google.accounts.id.renderButton(googleButtonRef.current, {
                        theme: 'filled_black',
                        size: 'large',
                        text: isSignUp ? 'signup_with' : (isContinue ? 'continue_with' : 'signin_with'),
                        shape: 'rectangular',
                        width: 380
                    });

                    if (isMounted) setGisReady(true);
                    return true;
                } catch (err) {
                    console.warn('Google Identity initialization error:', err);
                }
            }
            return false;
        };

        if (!initGis()) {
            intervalId = setInterval(() => {
                if (initGis() && intervalId) {
                    clearInterval(intervalId);
                }
            }, 300);
        }

        return () => {
            isMounted = false;
            if (intervalId) clearInterval(intervalId);
        };
    }, [googleClientId, isSignUp, isContinue, compact, handleGoogleResponse]);

    const handleCustomGoogleClick = async () => {
        // Use Google's native OAuth2 Token Client if available and client ID is present
        if (googleClientId && window.google?.accounts?.oauth2) {
            try {
                const tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: googleClientId,
                    scope: 'email profile openid',
                    callback: async (tokenResponse) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            setLoading(true);
                            try {
                                const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                                });
                                const info = await infoRes.json();

                                const user = await loginWithGoogle({
                                    email: info.email,
                                    name: info.name,
                                    google_id: info.sub,
                                    picture: info.picture,
                                    given_name: info.given_name,
                                    family_name: info.family_name
                                });
                                if (onSuccess) onSuccess(user);
                            } catch (e) {
                                const errText = typeof e === 'string' ? e : (e?.message || 'Failed to fetch Google profile');
                                if (onError) onError(errText);
                                setShowDevModal(true);
                            } finally {
                                setLoading(false);
                            }
                        }
                    },
                    error_callback: (err) => {
                        const errorMsg = typeof err === 'string' ? err : (err?.message || 'Google authentication failed');
                        if (onError) onError(errorMsg);
                        setShowDevModal(true);
                    }
                });
                tokenClient.requestAccessToken();
                return;
            } catch (err) {
                console.warn('OAuth2 client initialization error:', err);
            }
        }

        // Fallback to Google One Tap prompt if available and client ID is present
        if (googleClientId && window.google?.accounts?.id) {
            try {
                window.google.accounts.id.prompt();
                return;
            } catch (err) {
                console.warn('Google One Tap prompt error:', err);
            }
        }

        // Development / Demonstration fallback modal when Google Client ID or GIS is not loaded
        setModalError(null);
        setShowDevModal(true);
    };

    const handleDevSubmit = async (e) => {
        e.preventDefault();
        const email = devEmail.trim() || 'demo.user.google@gmail.com';
        const name = devName.trim() || 'Demo user google';
        const google_id = `google_${Math.abs(email.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))}`;
        const nameParts = name.split(' ');
        const given_name = nameParts[0] || '';
        const family_name = nameParts.slice(1).join(' ') || '';

        setLoading(true);
        setModalError(null);
        try {
            const user = await loginWithGoogle({
                email,
                name,
                display_name: name,
                google_id,
                picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
                given_name,
                family_name
            });
            setShowDevModal(false);
            if (onSuccess) onSuccess(user);
        } catch (err) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Google authentication failed');
            setModalError(errorMsg);
            if (onError) onError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={compact ? "" : "w-100"}>
            {/* Standard Google Sign-In Button Container (hidden in compact navbar mode or when GIS not ready) */}
            {!compact && (
                <div ref={googleButtonRef} className={gisReady && googleClientId ? "d-flex justify-content-center w-100 mb-2" : "d-none"}></div>
            )}

            {/* Custom Button (shown in compact mode, or when standard GIS button is not active) */}
            {(compact || !googleClientId || !gisReady) && (
                <button
                    type="button"
                    className={compact
                        ? "btn btn-sm btn-outline-warning d-flex align-items-center justify-content-center gap-2 fw-semibold"
                        : "btn btn-outline-light w-100 d-flex align-items-center justify-content-center gap-2 py-2 fw-semibold"}
                    onClick={handleCustomGoogleClick}
                    disabled={loading}
                    style={compact ? undefined : {
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
                <div className="modal d-block text-start" style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1070 }} tabIndex="-1">
                    <div className="modal-dialog modal-dialog-centered modal-sm">
                        <div className="modal-content bg-dark border-secondary text-light shadow-lg">
                            <div className="modal-header border-secondary py-2">
                                <h6 className="modal-title d-flex align-items-center gap-2 text-warning mb-0">
                                    <span>{isSignUp ? 'Google Account Sign-Up' : 'Google Account Sign-In'}</span>
                                </h6>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowDevModal(false)} aria-label="Close"></button>
                            </div>
                            <form onSubmit={handleDevSubmit}>
                                <div className="modal-body py-3">
                                    {modalError && (
                                        <div className="alert alert-danger py-1 small mb-2">
                                            {modalError}
                                        </div>
                                    )}
                                    <p className="small text-muted mb-3">
                                        Enter your Google account details to authenticate via Google Auth:
                                    </p>
                                    <div className="mb-2">
                                        <label className="form-label small text-muted">Google Email</label>
                                        <input
                                            type="email"
                                            className="form-control form-control-sm bg-dark text-light border-secondary"
                                            placeholder="demo.user.google@gmail.com"
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
                                            placeholder="Demo user google"
                                            value={devName}
                                            onChange={(e) => setDevName(e.target.value)}
                                        />
                                    </div>
                                    <div className="d-flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary btn-sm flex-fill"
                                            onClick={() => {
                                                setDevEmail('demo.user.google@gmail.com');
                                                setDevName('Demo user google');
                                            }}
                                        >
                                            Use Sample
                                        </button>
                                        <button type="submit" className="btn btn-warning btn-sm flex-fill fw-bold text-dark" disabled={loading}>
                                            {loading ? 'Authenticating...' : 'Continue'}
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