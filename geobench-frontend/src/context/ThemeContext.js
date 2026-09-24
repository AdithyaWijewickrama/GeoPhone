import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = {
    MODERN_DARK: 'modern-dark',
    CURRENT: 'current',
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
        id: 'current',
        label: 'Current',
        shortLabel: 'Current',
        icon: '🪵',
        badge: 'Classic',
        description: 'Original warm earthy dark theme with golden amber accents.'
    },
    {
        id: 'modern-white',
        label: 'Modern White (Professional)',
        shortLabel: 'Modern White',
        icon: '☀️',
        badge: 'Light',
        description: 'Clean, crisp enterprise white theme with deep slate text and ocean blue highlights.'
    }
];

const ThemeContext = createContext({
    theme: THEMES.CURRENT,
    setTheme: () => {},
    themes: THEME_OPTIONS
});

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('geophone_theme');
        if (saved && (saved === 'modern-dark' || saved === 'current' || saved === 'modern-white')) {
            return saved;
        }
        return 'current';
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

export function useTheme() {
    return useContext(ThemeContext);
}

export default ThemeContext;
