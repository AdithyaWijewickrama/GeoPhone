import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import GoogleAuthButton from './components/GoogleAuthButton';
import Signup from './pages/Signup';
import Login from './pages/Login';
import App from './App';

const renderWithProviders = (ui) => {
    return render(
        <ThemeProvider>
            <AuthProvider>
                <Router>
                    {ui}
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
};

describe('GoogleAuthButton Component', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        delete window.google;
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve([])
            })
        );
    });

    test('renders compact GoogleAuthButton for navbar', () => {
        renderWithProviders(<GoogleAuthButton text="Sign in with Google" compact={true} />);
        const btn = screen.getByRole('button', { name: /Sign in with Google/i });
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveClass('btn-sm');
    });

    test('opens Sign-Up dev modal on Signup page and allows sample filling', () => {
        renderWithProviders(<Signup />);
        const googleSignupBtn = screen.getByRole('button', { name: /Sign up with Google/i });
        expect(googleSignupBtn).toBeInTheDocument();

        fireEvent.click(googleSignupBtn);
        expect(screen.getByText('Google Account Sign-Up')).toBeInTheDocument();

        const sampleBtn = screen.getByText('Use Sample');
        fireEvent.click(sampleBtn);

        const emailInput = screen.getByPlaceholderText('alex.seismic@gmail.com');
        const nameInput = screen.getByPlaceholderText('Alex Seismic');
        expect(emailInput.value).toBe('alex.geophysicist@gmail.com');
        expect(nameInput.value).toBe('Dr. Alex Morgan');
    });

    test('opens Sign-In dev modal on Login page', () => {
        renderWithProviders(<Login />);
        const googleLoginBtn = screen.getByRole('button', { name: /Sign in with Google/i });
        expect(googleLoginBtn).toBeInTheDocument();

        fireEvent.click(googleLoginBtn);
        expect(screen.getByText('Google Account Sign-In')).toBeInTheDocument();
    });

    test('submits dev modal and calls loginWithGoogle successfully', async () => {
        const mockSuccess = jest.fn();
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    status: 'success',
                    user: { id: 99, username: 'demo_user', email: 'demo@gmail.com', is_google: true }
                })
            })
        );

        renderWithProviders(<GoogleAuthButton text="Sign in with Google" onSuccess={mockSuccess} />);
        fireEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));

        const continueBtn = screen.getByRole('button', { name: /Continue/i });
        fireEvent.click(continueBtn);

        await waitFor(() => {
            expect(mockSuccess).toHaveBeenCalledWith(
                expect.objectContaining({ id: 99, username: 'demo_user' })
            );
        });
    });

    test('handles authentication error in dev modal without closing modal silently', async () => {
        const mockError = jest.fn();
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: false,
                json: () => Promise.resolve({
                    error: 'Invalid Google payload'
                })
            })
        );

        renderWithProviders(<GoogleAuthButton text="Sign up with Google" onError={mockError} />);
        fireEvent.click(screen.getByRole('button', { name: /Sign up with Google/i }));

        const continueBtn = screen.getByRole('button', { name: /Continue/i });
        fireEvent.click(continueBtn);

        await waitFor(() => {
            expect(screen.getByText('Invalid Google payload')).toBeInTheDocument();
            expect(mockError).toHaveBeenCalledWith('Invalid Google payload');
        });
    });

    test('renders GoogleAuthButton in App navigation bar and login page when unauthenticated', async () => {
        render(<App />);
        await waitFor(() => {
            const googleButtons = screen.getAllByRole('button', { name: /Sign in with Google/i });
            expect(googleButtons.length).toBeGreaterThanOrEqual(1);
            expect(googleButtons[0]).toHaveClass('btn-sm');
        });
    });
});
