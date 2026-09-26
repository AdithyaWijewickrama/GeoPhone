import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = {
    MODERN_DARK: 'modern-dark',
    GEOPHONE: 'geophone-dark',
    MODERN_WHITE: 'modern-white'
};

export const THEME_OPTIONS = [
    {
        id: 'modern-dark',
        label: 'Modern Dark',
        shortLabel: 'Modern Dark',
        icon: '🌙',
        badge: 'Dark',
        description: 'Sleek, high-contrast dark theme with cyan/blue accents and deep slate canvas.'
    },
    {
        id: 'geophone-dark',
        label: 'Geophone Dark',
        shortLabel: 'Geophone Dark',
        icon: '',
        badge: 'Classic',
        description: 'Original warm earthy dark theme with golden amber accents.'
    },
    {
        id: 'modern-white',
        label: 'Modern White',
        shortLabel: 'Modern White',
        icon: '☀️',
        badge: 'Light',
        description: 'Clean, crisp enterprise white theme with deep slate text and ocean blue highlights.'
    }
];

const ThemeContext = createContext({
    theme: THEMES.GEOPHONE,
    setTheme: () => {},
    themes: THEME_OPTIONS
});

/**
 * Loads and applies the saved theme and provides theme selection state/actions to descendants.
 */
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('geophone_theme');
        if (saved && (saved === 'modern-dark' || saved === 'geophone-dark' || saved === 'modern-white')) {
            return saved;
        }
        return 'geophone-dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        try {
            localStorage.setItem('geophone_theme', theme);
        } catch (e) {
            console.warn('Unable to persist theme to localStorage', e);
        }
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEME_OPTIONS }}>
            {children}
        </ThemeContext.Provider>
    );
}

/**
 * Returns the theme context.
 */
export function useTheme() {
    return useContext(ThemeContext);
}

export default ThemeContext;
