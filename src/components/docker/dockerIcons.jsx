import React from 'react';

// Docker-specific glyphs, drawn on the same 24px grid and stroke as Icons.jsx.
const G = ({ size = 14, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const DIcon = {
  Whale: (p) => <G {...p}><path d="M3 12.5h15.5c1.4 0 2.4-1 2.8-2.2.4.1 1 .1 1.2-.3-.6-.6-1.4-.7-2-.4-.3-1-1-1.6-1-1.6s-.9 1-.6 2.3H3c-.3 3.6 2.3 7.2 8 7.2 4.6 0 7.6-2.2 9-5"/><path d="M5 12.5V10h2.5v2.5M7.5 10V7.5H10V10M10 12.5V10h2.5v2.5M10 7.5V5h2.5v2.5M12.5 10V7.5H15V10"/></G>,
  Play: (p) => <G {...p}><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/></G>,
  Stop: (p) => <G {...p}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/></G>,
  Pause: (p) => <G {...p}><path d="M8 5v14M16 5v14" strokeWidth={3}/></G>,
  Restart: (p) => <G {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></G>,
  Trash: (p) => <G {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></G>,
  Box: (p) => <G {...p}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></G>,
  Layers: (p) => <G {...p}><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></G>,
  Disk: (p) => <G {...p}><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></G>,
  Network: (p) => <G {...p}><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5l-5.5 5.5M12 11.5l5.5 5.5"/></G>,
  Stack: (p) => <G {...p}><rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="11" width="16" height="5" rx="1.5"/><path d="M8 20h8"/></G>,
  Logs: (p) => <G {...p}><path d="M5 6h14M5 10h14M5 14h9M5 18h6"/></G>,
  Prompt: (p) => <G {...p}><path d="M5 8l4 4-4 4M12 17h7"/></G>,
  Chart: (p) => <G {...p}><path d="M4 19h16M7 15l3-4 3 2 4-6"/></G>,
  Info: (p) => <G {...p}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></G>,
  Close: (p) => <G {...p}><path d="M6 6l12 12M18 6L6 18"/></G>,
  Search: (p) => <G {...p}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></G>,
  Refresh: (p) => <G {...p}><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></G>,
  Download: (p) => <G {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></G>,
  Broom: (p) => <G {...p}><path d="M14 4l6 6M12 8l4 4-6 8H4v-6z"/></G>,
  Chevron: (p) => <G {...p}><path d="M9 6l6 6-6 6"/></G>,
  Up: (p) => <G {...p}><path d="M12 19V5M6 11l6-6 6 6"/></G>,
  Down: (p) => <G {...p}><path d="M12 5v14M6 13l6 6 6-6"/></G>,
};
