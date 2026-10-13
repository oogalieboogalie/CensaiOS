/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Icons for YorWare PDF: 14px line drawings in the same style as the Censai
// Creative tool icons; they take the button's text color.
function Svg({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
  );
}

export const PdfIcon = {
  Doc: (p) => <Svg {...p}><path d="M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5" /></Svg>,
  Sign: (p) => <Svg {...p}><path d="M1.5 12c2-3 3-7 4.5-7s-1 6 1 6 2-3 3-3 .5 2 1.5 2 2-1 3-1M1.5 14.5h13" /></Svg>,
  Highlight: (p) => <Svg {...p}><path d="M9.5 2.5l4 4-5 5H5v-3.5zM5 11.5l-2 2.5h4M8 13.5h6" /></Svg>,
  Redact: (p) => <Svg {...p}><rect x="2" y="5" width="12" height="6" rx="1" fill="currentColor" /></Svg>,
  Rotate: (p) => <Svg {...p}><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.8h-2.8" /></Svg>,
  Up: (p) => <Svg {...p}><path d="M8 13V3M4 7l4-4 4 4" /></Svg>,
  Down: (p) => <Svg {...p}><path d="M8 3v10M4 9l4 4 4-4" /></Svg>,
  Prev: (p) => <Svg {...p}><path d="M10 3.5 5.5 8l4.5 4.5" /></Svg>,
  Next: (p) => <Svg {...p}><path d="M6 3.5 10.5 8 6 12.5" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4M6.8 6.5v5M9.2 6.5v5" /></Svg>,
  Find: (p) => <Svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="M10.4 10.4 14 14" /></Svg>,
  Open: (p) => <Svg {...p}><path d="M1.5 4V2.5h4.5l1.5 1.5h7v2M1.5 4v9.5h11.5l1.5-7H3.5L1.5 13" /></Svg>,
};
