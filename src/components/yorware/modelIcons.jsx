/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Icons for the YorWare 3D Viewer: 14px line drawings in the same style as
// the other YorWare apps; they take the button's text color.
function Svg({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
  );
}

export const ModelIcon = {
  Cube: (p) => <Svg {...p}><path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7z" /><path d="M2.5 4.5L8 7.5l5.5-3M8 7.5v7" /></Svg>,
  Open: (p) => <Svg {...p}><path d="M1.5 4V2.5h4.5l1.5 1.5h7v2M1.5 4v9.5h11.5l1.5-7H3.5L1.5 13" /></Svg>,
  Sample: (p) => <Svg {...p}><path d="M8 1.5c2 1.6 3 3.8 3 6.5v3.5H5V8c0-2.7 1-4.9 3-6.5z" /><circle cx="8" cy="7" r="1.2" /><path d="M5 9.5L3 12v1.5h2M11 9.5l2 2.5v1.5h-2M7 13.5v1M9 13.5v1" /></Svg>,
  Fit: (p) => <Svg {...p}><path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" /><rect x="5.5" y="5.5" width="5" height="5" rx="1" /></Svg>,
  Turn: (p) => <Svg {...p}><ellipse cx="8" cy="8" rx="6.5" ry="2.8" /><path d="M11.5 3.8l1.3 1.6-2 .6" /><path d="M8 2v12" strokeDasharray="1.5 1.5" /></Svg>,
  Orbit: (p) => <Svg {...p}><path d="M3 5.5a6 6 0 0 1 10 0M13 10.5a6 6 0 0 1-10 0" /><path d="M11.2 3.6L13 5.5l.4-2.4M4.8 12.4L3 10.5l-.4 2.4" /><circle cx="8" cy="8" r="1.4" /></Svg>,
  Measure: (p) => <Svg {...p}><rect x="1.5" y="5" width="13" height="6" rx="1" transform="rotate(-30 8 8)" /><path d="M5 9.8l-.8-1.4M7.2 8.5l-1.2-2M9.4 7.2l-.8-1.4M11.6 6l-1.2-2" /></Svg>,
  Note: (p) => <Svg {...p}><path d="M8 14.5s-4.5-4.2-4.5-7.5a4.5 4.5 0 0 1 9 0c0 3.3-4.5 7.5-4.5 7.5z" /><circle cx="8" cy="7" r="1.6" /></Svg>,
  Eye: (p) => <Svg {...p}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></Svg>,
  EyeOff: (p) => <Svg {...p}><path d="M2.5 2.5l11 11M6.6 4A6 6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.9 2.4M10.3 11.9a5.4 5.4 0 0 1-2.3.6C4 12.5 1.5 8 1.5 8a11 11 0 0 1 2.4-2.8" /></Svg>,
  StandUp: (p) => <Svg {...p}><path d="M3 13.5h10M8 12V2.5M5.5 5L8 2.5 10.5 5" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4M6.8 6.5v5M9.2 6.5v5" /></Svg>,
  Camera: (p) => <Svg {...p}><path d="M1.5 5h3l1.2-2h4.6L11.5 5h3v8h-13z" /><circle cx="8" cy="9" r="2.4" /></Svg>,
};
