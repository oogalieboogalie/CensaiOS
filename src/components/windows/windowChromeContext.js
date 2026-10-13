import React from 'react';

/**
 * Frame → title channel for per-window chrome state.
 *
 * WindowFrame.jsx provides `{ chromeVariant, trafficControls, isActive }`;
 * WindowTitle.jsx consumes `trafficControls` to match its rail padding to
 * the frame's control layout, and `chromeVariant` + `isActive` to render
 * full header skins (e.g. the win98 navy active / gray inactive bar).
 * Default is `null` so titles rendered outside a frame (tests, lab
 * previews) keep the historical mood-only behavior.
 */
export const WindowChromeContext = React.createContext(null);
