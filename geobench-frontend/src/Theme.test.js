import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import ThemeSelector from './components/ThemeSelector';
import { ThemeProvider, useTheme, THEMES } from './context/ThemeContext';

describe('Theme Context and Look and Feel Changer', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.body.removeAttribute('data-theme');
    });

    test('defaults to "current" theme and sets data-theme attribute', () => {
        function TestConsumer() {
            const { theme } = useTheme();
            return <div data-testid="current-theme">{theme}</div>;
        }

        render(
            <ThemeProvider>
                <TestConsumer />
            </ThemeProvider>
        );

        expect(screen.getByTestId('current-theme').textContent).toBe('current');
        expect(document.documentElement.getAttribute('data-theme')).toBe('current');
        expect(document.body.getAttribute('data-theme')).toBe('current');
    });

    test('loads previously saved theme from localStorage', () => {
        localStorage.setItem('geophone_theme', 'modern-dark');

        function TestConsumer() {
            const { theme } = useTheme();
            return <div data-testid="current-theme">{theme}</div>;
        }

        render(
            <ThemeProvider>
                <TestConsumer />
            </ThemeProvider>
        );

        expect(screen.getByTestId('current-theme').textContent).toBe('modern-dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('modern-dark');
    });

    test('ThemeSelector allows switching between Modern Dark, Current, and Modern White (Professional)', () => {
        render(
            <ThemeProvider>
                <ThemeSelector />
            </ThemeProvider>
        );

        // Initially displays Current
        const triggerBtn = screen.getByTestId('theme-changer-button');
        expect(triggerBtn).toBeInTheDocument();
        expect(screen.getByText('Current')).toBeInTheDocument();

        // Open dropdown
        fireEvent.click(triggerBtn);
        expect(screen.getByTestId('theme-dropdown-menu')).toBeInTheDocument();
        expect(screen.getByText('Modern Dark')).toBeInTheDocument();
        expect(screen.getByText('Modern White (Professional)')).toBeInTheDocument();

        // Select Modern Dark
        const modernDarkBtn = screen.getByTestId('theme-option-modern-dark');
        fireEvent.click(modernDarkBtn);

        expect(document.documentElement.getAttribute('data-theme')).toBe('modern-dark');
        expect(localStorage.getItem('geophone_theme')).toBe('modern-dark');
        expect(screen.getByText('Modern Dark')).toBeInTheDocument();

        // Open dropdown again and select Modern White (Professional)
        fireEvent.click(triggerBtn);
        const modernWhiteBtn = screen.getByTestId('theme-option-modern-white');
        fireEvent.click(modernWhiteBtn);

        expect(document.documentElement.getAttribute('data-theme')).toBe('modern-white');
        expect(localStorage.getItem('geophone_theme')).toBe('modern-white');
        expect(screen.getByText('Modern White')).toBeInTheDocument();

        // Open dropdown again and select Current
        fireEvent.click(triggerBtn);
        const currentBtn = screen.getByTestId('theme-option-current');
        fireEvent.click(currentBtn);

        expect(document.documentElement.getAttribute('data-theme')).toBe('current');
        expect(localStorage.getItem('geophone_theme')).toBe('current');
        expect(screen.getByText('Current')).toBeInTheDocument();
    });

    test('renders Look and Feel changer inside the full App navigation', () => {
        render(<App />);

        const changerBtn = screen.getByTestId('theme-changer-button');
        expect(changerBtn).toBeInTheDocument();

        // Click to open and switch theme to modern-dark
        fireEvent.click(changerBtn);
        const modernDarkOption = screen.getByTestId('theme-option-modern-dark');
        fireEvent.click(modernDarkOption);

        expect(document.documentElement.getAttribute('data-theme')).toBe('modern-dark');
    });
});
