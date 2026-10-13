/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Icons for YorWare Photos: 14px line drawings in the same style as the
// YorWare PDF and Censai Creative icons; they take the button's text color.
function Svg({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
  );
}

const STAR = 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z';

export const PhotoIcon = {
  Photo: (p) => <Svg {...p}><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><circle cx="5.5" cy="6" r="1.3" /><path d="M1.5 11.5l4-3.5 3 2.5 2-1.5 4 3" /></Svg>,
  Grid: (p) => <Svg {...p}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></Svg>,
  Develop: (p) => <Svg {...p}><path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h9M14 12h0" /><circle cx="10.5" cy="4" r="1.5" /><circle cx="5.5" cy="8" r="1.5" /><circle cx="12.5" cy="12" r="1.5" /></Svg>,
  Compare: (p) => <Svg {...p}><rect x="1.5" y="3" width="5.5" height="10" rx="1" /><rect x="9" y="3" width="5.5" height="10" rx="1" /></Svg>,
  Star: (p) => <Svg {...p}><path d={STAR} /></Svg>,
  StarFill: (p) => <Svg {...p}><path d={STAR} fill="currentColor" /></Svg>,
  Pick: (p) => <Svg {...p}><path d="M3.5 14.5V2h9l-2 3.2 2 3.3h-9" /></Svg>,
  Reject: (p) => <Svg {...p}><circle cx="8" cy="8" r="6" /><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" /></Svg>,
  Crop: (p) => <Svg {...p}><path d="M4 1.5V12h10.5M1.5 4H12v10.5" /></Svg>,
  RotateLeft: (p) => <Svg {...p}><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" /></Svg>,
  RotateRight: (p) => <Svg {...p}><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.8h-2.8" /></Svg>,
  Flip: (p) => <Svg {...p}><path d="M8 1.5v13M6 4L2 12h4zM10 4l4 8h-4z" /></Svg>,
  Auto: (p) => <Svg {...p}><path d="M2.5 13.5l8-8M9 3.5l1.5 1.5M11.5 1.5v2M13.5 4.5h-2M13 1.8l-1 1M5 2v2M4 3h2M13 9v2M12 10h2" /></Svg>,
  Board: (p) => <Svg {...p}><rect x="1.5" y="2" width="13" height="12" rx="1.5" /><rect x="3.5" y="4" width="4" height="3" rx=".5" /><rect x="8.5" y="8" width="4" height="4" rx=".5" /></Svg>,
  Open: (p) => <Svg {...p}><path d="M1.5 4V2.5h4.5l1.5 1.5h7v2M1.5 4v9.5h11.5l1.5-7H3.5L1.5 13" /></Svg>,
  Copy: (p) => <Svg {...p}><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></Svg>,
  Paste: (p) => <Svg {...p}><path d="M5.5 2.5h-2v12h9v-12h-2M5.5 1.5h5v2.5h-5z" /></Svg>,
  Reset: (p) => <Svg {...p}><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4M2.5 2v3h3" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4M6.8 6.5v5M9.2 6.5v5" /></Svg>,
  Prev: (p) => <Svg {...p}><path d="M10 3.5 5.5 8l4.5 4.5" /></Svg>,
  Next: (p) => <Svg {...p}><path d="M6 3.5 10.5 8 6 12.5" /></Svg>,
};
