import React, { createContext, useContext, useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

export const AuthContext = createContext();

/**
 * Provides authentication state and login, signup, Google login, and logout actions; it restores/checks the current session when mounted.
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const saved = localStorage.getItem('geophone_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Verify current session with backend on load
        fetch(`${API_BASE_URL}/api/auth/me/`)
            .then(res => res.json())
            .then(data => {
                if (data.authenticated && data.user) {
                    setUser(data.user);
                    localStorage.setItem('geophone_user', JSON.stringify(data.user));
                } else {
                    setUser(prevUser => {
                        if (!prevUser) {
                            localStorage.removeItem('geophone_user');
                            return null;
                        }
                        return prevUser;
                    });
                }
            })
            .catch(() => {
                // If offline or CORS issue, keep local state
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    /**
     * Sends credentials to the backend, updates the stored user on success, and reports failure.
     */
    const login = async (username, password) => {
        const res = await fetch(`${API_BASE_URL}/api/auth/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || 'Login failed');
        }
        setUser(data.user);
        localStorage.setItem('geophone_user', JSON.stringify(data.user));
        return data.user;
    };

    /**
     * Sends registration data and updates authentication state from the backend response.
     */
    const signup = async ({ username, email, password, first_name, last_name }) => {
        const res = await fetch(`${API_BASE_URL}/api/auth/signup/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, first_name, last_name })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || 'Signup failed');
        }
        setUser(data.user);
        localStorage.setItem('geophone_user', JSON.stringify(data.user));
        return data.user;
    };

    /**
     * Exchanges Google identity data with the backend and updates the signed-in user.
     */
    const loginWithGoogle = async (googleData) => {
        const res = await fetch(`${API_BASE_URL}/api/auth/google/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(googleData)
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || 'Google authentication failed');
        }
        setUser(data.user);
        localStorage.setItem('geophone_user', JSON.stringify(data.user));
        return data.user;
    };

    /**
     * Ends the backend session and clears local user state/storage.
     */
    const logout = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout/`, { method: 'POST' });
        } catch (e) {
            // ignore
        }
        setUser(null);
        localStorage.removeItem('geophone_user');
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            isAuthenticated: !!user,
            login,
            signup,
            loginWithGoogle,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Returns the authentication context and throws when used outside `AuthProvider`.
 */
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
