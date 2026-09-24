import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthContext } from './context/AuthContext';

function renderWithAuth(ui, authValue = {}, initialEntries = ['/protected']) {
    const defaultAuth = {
        user: null,
        loading: false,
        isAuthenticated: false,
        login: jest.fn(),
        signup: jest.fn(),
        logout: jest.fn(),
        loginWithGoogle: jest.fn(),
        ...authValue
    };

    return render(
        <AuthContext.Provider value={defaultAuth}>
            <MemoryRouter initialEntries={initialEntries}>
                <Routes>
                    <Route path="/login" element={<div>Login Page</div>} />
                    <Route
                        path="/protected"
                        element={
                            <ProtectedRoute>
                                <div>Protected Content</div>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    );
}

describe('ProtectedRoute', () => {
    test('redirects unauthenticated user to /login', () => {
        renderWithAuth(<div />, { isAuthenticated: false, loading: false });
        expect(screen.getByText('Login Page')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    test('renders protected content when user is authenticated', () => {
        renderWithAuth(
            <div />,
            { isAuthenticated: true, user: { id: 1, username: 'testuser' }, loading: false }
        );
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
        expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });

    test('displays loading spinner while auth state is loading', () => {
        renderWithAuth(<div />, { isAuthenticated: false, loading: true });
        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
});
