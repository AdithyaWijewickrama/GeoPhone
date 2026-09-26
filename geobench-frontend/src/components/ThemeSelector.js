import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * Renders the theme picker and closes its menu when a click occurs outside it.
 */
export default function ThemeSelector() {
    const { theme, setTheme, themes } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const currentThemeObj = themes.find(t => t.id === theme) || themes[1]; // default to current

    // Close dropdown on outside click
    useEffect(() => {
        /**
         * Detects clicks outside the theme menu and closes it.
         */
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="position-relative d-inline-block theme-selector-wrapper" ref={dropdownRef}>
            <button
                type="button"
                className="btn btn-sm btn-outline-theme d-flex align-items-center gap-2"
                onClick={() => setIsOpen(prev => !prev)}
                aria-expanded={isOpen}
                aria-haspopup="true"
                title="Change Look & Feel / Theme"
                data-testid="theme-changer-button"
            >
                <span className="theme-trigger-icon">{currentThemeObj.icon}</span>
                <span className="d-none d-sm-inline fw-semibold">Look & Feel:</span>
                <span className="fw-bold theme-current-name">{currentThemeObj.shortLabel}</span>
                <span className="dropdown-arrow-indicator" style={{ fontSize: '0.65rem' }}>▼</span>
            </button>

            {isOpen && (
                <div
                    className="dropdown-menu show theme-dropdown-menu position-absolute end-0 mt-2 p-2 shadow-lg"
                    style={{ minWidth: '270px', zIndex: 1100 }}
                    data-testid="theme-dropdown-menu"
                >
                    <div className="px-2 py-1 mb-1 border-bottom theme-dropdown-header">
                        <small className="text-uppercase fw-bold letter-spacing-1 theme-header-text">
                            Select Look & Feel
                        </small>
                    </div>

                    <div className="d-flex flex-column gap-1">
                        {themes.map((t) => {
                            const isSelected = theme === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={`dropdown-item theme-option-btn rounded-2 p-2 d-flex align-items-start gap-2 ${
                                        isSelected ? 'active-theme-item' : ''
                                    }`}
                                    onClick={() => {
                                        setTheme(t.id);
                                        setIsOpen(false);
                                    }}
                                    data-testid={`theme-option-${t.id}`}
                                >
                                    <span className="fs-5 mt-n1">{t.icon}</span>
                                    <div className="flex-grow-1 text-start">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <span className="fw-semibold theme-option-title">{t.label}</span>
                                            {isSelected && (
                                                <span className="badge rounded-pill theme-active-badge">Active</span>
                                            )}
                                        </div>
                                        <div className="small theme-option-desc mt-1" style={{ fontSize: '0.75rem', lineHeight: 1.3 }}>
                                            {t.description}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
