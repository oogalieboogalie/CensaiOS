/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Tool icons for the Censai Creative editors: 14px line drawings that take
// the button's text color.
function Svg({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
  );
}

export const ToolIcon = {
  Move: (p) => <Svg {...p}><path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2" /></Svg>,
  Pointer: (p) => <Svg {...p}><path d="M3 2l9.5 5.2-4.2 1.1-1.9 4.2z" /></Svg>,
  Direct: (p) => <Svg {...p}><path d="M3 2l9.5 5.2-4.2 1.1-1.9 4.2z" fill="currentColor" /></Svg>,
  Brush: (p) => <Svg {...p}><path d="M13.5 2.5 7 9M5.5 9.5c-2 0-2.5 1.6-2.5 2.6 0 .9-.6 1.4-1.2 1.6 2.6.9 5.2.2 5.2-2.2 0-.8-.6-2-1.5-2z" /></Svg>,
  Eraser: (p) => <Svg {...p}><path d="M9.5 2.5l4 4-6.5 6.5H4.5l-2-2a1 1 0 0 1 0-1.4zM6 6l4 4M7 13h7" /></Svg>,
  Marquee: (p) => <Svg {...p}><path d="M2.5 4.5v-2h2M7 2.5h2M11.5 2.5h2v2M13.5 7v2M13.5 11.5v2h-2M9 13.5H7M4.5 13.5h-2v-2M2.5 9V7" /></Svg>,
  Text: (p) => <Svg {...p}><path d="M3 3.5h10M8 3.5v10M6 13.5h4" /></Svg>,
  Picker: (p) => <Svg {...p}><path d="M10.5 2.5a1.8 1.8 0 0 1 2.6 2.6L11.5 6.7l-2.2-2.2zM9.8 5.2 3.5 11.5 2.5 13.5l2-1 6.3-6.3" /></Svg>,
  Crop: (p) => <Svg {...p}><path d="M4.5 1.5v10h10M1.5 4.5h10v10" /></Svg>,
  Rect: (p) => <Svg {...p}><rect x="2.5" y="3.5" width="11" height="9" rx="1" /></Svg>,
  Ellipse: (p) => <Svg {...p}><ellipse cx="8" cy="8" rx="5.5" ry="4.5" /></Svg>,
  Line: (p) => <Svg {...p}><path d="M3 13 13 3" /></Svg>,
  Pen: (p) => <Svg {...p}><path d="M8 1.5 12 7l-1.5 4h-5L4 7zM8 1.5V7M6.5 14.5h3" /><circle cx="8" cy="8" r=".8" /></Svg>,
  Undo: (p) => <Svg {...p}><path d="M5 4 2.5 6.5 5 9M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7" /></Svg>,
  Redo: (p) => <Svg {...p}><path d="M11 4l2.5 2.5L11 9M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9" /></Svg>,
  FlipH: (p) => <Svg {...p}><path d="M8 1.5v13M6 4 2.5 12H6zM10 4l3.5 8H10z" /></Svg>,
  Scissors: (p) => <Svg {...p}><circle cx="4" cy="4.5" r="2" /><circle cx="4" cy="11.5" r="2" /><path d="M5.6 5.7 14 12M5.6 10.3 14 4" /></Svg>,
  Group: (p) => <Svg {...p}><rect x="1.5" y="1.5" width="8" height="8" rx="1" /><rect x="6.5" y="6.5" width="8" height="8" rx="1" /></Svg>,
  AlignLeft: (p) => <Svg {...p}><path d="M2 1.5v13M4 4.5h8M4 10.5h5" /></Svg>,
  AlignCenterH: (p) => <Svg {...p}><path d="M8 1.5v13M3 4.5h10M5 10.5h6" /></Svg>,
  AlignRight: (p) => <Svg {...p}><path d="M14 1.5v13M4 4.5h8M7 10.5h5" /></Svg>,
  AlignTop: (p) => <Svg {...p}><path d="M1.5 2h13M4.5 4v8M10.5 4v5" /></Svg>,
  AlignMiddle: (p) => <Svg {...p}><path d="M1.5 8h13M4.5 3v10M10.5 5v6" /></Svg>,
  AlignBottom: (p) => <Svg {...p}><path d="M1.5 14h13M4.5 4v8M10.5 7v5" /></Svg>,
  DistributeH: (p) => <Svg {...p}><path d="M1.5 2v12M14.5 2v12M6 5v6M10 5v6" /></Svg>,
  DistributeV: (p) => <Svg {...p}><path d="M2 1.5h12M2 14.5h12M5 6h6M5 10h6" /></Svg>,
  Front: (p) => <Svg {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="currentColor" /><path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" /></Svg>,
  Back: (p) => <Svg {...p}><rect x="1.5" y="1.5" width="8" height="8" rx="1" fill="currentColor" /><path d="M12.5 5.5h1v8h-8v-1" /></Svg>,
  Title: (p) => <Svg {...p}><rect x="1.5" y="3" width="13" height="10" rx="1" /><path d="M5 6.5h6M8 6.5v4" /></Svg>,
};
