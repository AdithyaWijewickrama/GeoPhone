# Themes Directory

Standalone theme layers for GeoPhone. Each file is a complete, self-contained
theme driven by the `data-theme` attribute that `ThemeContext` sets on
`<html>` and `<body>`.

## Files

| File               | Theme id         | Look                                                      |
| ------------------ | ---------------- | --------------------------------------------------------- |
| `modern-dark.css`  | `modern-dark`    | Deep blue-slate canvas, indigo→violet gradient accents    |
| `modern-white.css` | `modern-white`   | Airy near-white canvas, vivid blue accent, soft shadows   |

The classic warm "current" theme still lives in `../App.css`.

## Load order (important)

Both files are imported in `src/index.js` **after** `App.css` is imported by
components, so these rules win the cascade:

```js
import App from './App';
import './themes/modern-dark.css';
import './themes/modern-white.css';
```

Their selectors use `html[data-theme="…"]`, which is also strictly more
specific than the bare `[data-theme="…"]` selectors in `App.css`.

## What each file contains

1. **Design tokens** — one `html[data-theme]` block defining all `--geo-*`
   variables (surface, text, accent, shadow, scrollbar), plus modern extras
   App.css doesn't have: `--geo-font-*`, `--geo-radius-*`, `--geo-speed`,
   `--geo-ease`, `--geo-gradient`, `--geo-glow`.
2. **Typography** — Inter (body), Space Grotesk (headings), JetBrains Mono
   (code), loaded via Google Fonts `@import` with full system fallbacks.
3. **Surfaces** — rounded cards, modals, dropdowns; sticky glass navbar.
4. **Interactions** — sliding gradient nav-link underline, button hover lift
   + press scale, focus glow rings, hover states for selectable items,
   custom text selection, styled scrollbar.
5. **Accessibility** — `prefers-reduced-motion` disables all transitions.

## Adding a new theme

1. Copy `modern-dark.css` to `themes/<id>.css`, change every
   `html[data-theme="modern-dark"]` selector to the new id, and retune the
   token values in section 1.
2. Register the id in `../context/ThemeContext.js` (`THEMES`, `THEME_OPTIONS`
   and the whitelist in `useState`).
3. Add an import in `../index.js` next to the other theme files.
