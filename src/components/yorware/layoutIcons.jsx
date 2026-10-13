/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Icons for YorWare Layout: 14px line drawings in the same style as the
// YorWare PDF and Censai Creative icons; they take the button's text color.
function Svg({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
  );
}

const ALIGN = {
  left: 'M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h7',
  center: 'M2 3.5h12M4 6.5h8M2 9.5h12M4.5 12.5h7',
  right: 'M2 3.5h12M6 6.5h8M2 9.5h12M7 12.5h7',
};

export const LayoutIcon = {
  Doc: (p) => <Svg {...p}><rect x="2.5" y="1.5" width="11" height="13" rx="0.5" /><path d="M4.5 4h7M4.5 6.5h3M9 6.5h2.5v4H9zM4.5 9h3M4.5 11.5h3" /></Svg>,
  Picture: (p) => <Svg {...p}><rect x="1.5" y="2.5" width="13" height="11" /><path d="M1.5 2.5l13 11M14.5 2.5l-13 11" /></Svg>,
  Align: ({ dir = 'left', ...p }) => <Svg {...p}><path d={ALIGN[dir] || ALIGN.left} /></Svg>,
  Flow: (p) => <Svg {...p}><rect x="1.5" y="1.5" width="5.5" height="7" /><rect x="9" y="7.5" width="5.5" height="7" /><path d="M7 5h2.5a1.5 1.5 0 0 1 1.5 1.5v1M9.8 6.2 11 7.5l1.2-1.3" /></Svg>,
  Link: (p) => <Svg {...p}><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L5.5 8" /></Svg>,
  Unlink: (p) => <Svg {...p}><path d="M7 4.5l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L5.5 8M2 2l2 2M14 14l-2-2" /></Svg>,
  Duplicate: (p) => <Svg {...p}><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M11 5V2.5H2.5V11H5" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4" /></Svg>,
  AddPage: (p) => <Svg {...p}><path d="M4 1.5h5.5L12.5 4.5v10h-8.5zM8.2 7.5v4.5M6 9.7h4.5" /></Svg>,
  Prev: (p) => <Svg {...p}><path d="M10 3.5 5.5 8l4.5 4.5" /></Svg>,
  Next: (p) => <Svg {...p}><path d="M6 3.5 10.5 8 6 12.5" /></Svg>,
  Up: (p) => <Svg {...p}><path d="M8 13V3M4 7l4-4 4 4" /></Svg>,
  Down: (p) => <Svg {...p}><path d="M8 3v10M4 9l4 4 4-4" /></Svg>,
};
