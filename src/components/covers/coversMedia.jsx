/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { S, F, A, H, INK, SOFT, FAINT, ACCENT } from './kit.js';

// Create, Media, People and System windows, plus covers for modules people
// make themselves. Branded ones leave the right third for the mark.
export const MEDIA_COVERS = {
  // A picture appearing, with a spark.
  genImage: (
    <>
      <rect x="6" y="4" width="22" height="16" rx="1" {...S} />
      <path d="M8 18 L14 11.5 L19 16 L22 13.5 L26 18" {...F} />
      <path d="M34 5 Q34.6 9.4 39 10 Q34.6 10.6 34 15 Q33.4 10.6 29 10 Q33.4 9.4 34 5 Z" fill={ACCENT} />
    </>
  ),
  // Layers stacked up in the studio.
  imageStudio: (
    <>
      <rect x="16" y="3.5" width="20" height="12" rx="1" {...F} /><rect x="12" y="6.5" width="20" height="12" rx="1" {...S} />
      <rect x="8" y="9.5" width="20" height="12" rx="1" {...A} fill="var(--surface-sunken)" />
      <path d="M10 19.5 L15 15 L19 18 L21 16.5 L25 19.5" {...F} />
    </>
  ),
  // A single picture in a frame.
  image: (
    <>
      <rect x="9" y="4" width="26" height="16" rx="1" {...S} />
      <path d="M11 18 L18 11 L24 16 L27.5 13 L33 18" {...F} /><circle cx="28" cy="8.5" r="1.8" fill={ACCENT} />
    </>
  ),
  // A sticky note pinned up.
  idea: (
    <>
      <path d="M13 4 H31 V15 L25 20 H13 Z" {...S} /><path d="M31 15 H25 V20" {...F} />
      <path d="M16 9 H27 M16 12 H24" {...F} /><circle cx="22" cy="4" r="1.6" fill={ACCENT} />
    </>
  ),
  // A pen line drawn free hand.
  sketchpad: (
    <>
      <path d="M5 16 C9 6 13 6 15 12 C17 18 21 18 23 10 C24.5 5 28 6 29 10" {...S} />
      <path d="M31 16 L37 6 L39.4 7.4 L33.4 17.4 L30.6 18.5 Z" {...A} strokeWidth="1" />
    </>
  ),
  // A board at the front, a class in rows.
  classroom: (
    <>
      <rect x="9" y="3" width="26" height="9" rx="1" {...S} />
      <path d="M12 6.5 H24" stroke={ACCENT} strokeWidth="1.2" strokeLinecap="round" /><path d="M12 9 H20" {...F} />
      {[12, 18, 24, 30].map(x => <circle key={x} cx={x} cy="16" r="1.3" fill={SOFT} />)}
      {[15, 21, 27].map(x => <circle key={x} cx={x} cy="20" r="1.3" fill={FAINT} />)}
    </>
  ),
  // Friends following each other's boards.
  social: (
    <>
      <path d="M12 12 L22 7 L32 12 L22 18 Z M12 12 H32" {...F} />
      <circle cx="12" cy="12" r="2.6" fill={SOFT} /><circle cx="32" cy="12" r="2.6" fill={SOFT} />
      <circle cx="22" cy="18" r="2.2" fill={FAINT} /><circle cx="22" cy="7" r="3" {...A} fill="var(--surface-sunken)" />
    </>
  ),
  // Tall clips side by side.
  shorts: (
    <>
      <rect x="5" y="4" width="8" height="16" rx="1.4" {...F} /><rect x="15" y="3" width="9" height="18" rx="1.4" {...S} />
      <path d="M18.3 9.5 L21.5 12 L18.3 14.5 Z" fill={ACCENT} />
    </>
  ),
  // An old-school pocket player: screen up top, click wheel below.
  music: (
    <>
      <rect x="15" y="2.5" width="14" height="19" rx="2.2" {...S} />
      <rect x="17.2" y="4.6" width="9.6" height="5.8" rx="0.6" {...F} />
      <path d="M18.6 8.6 V7.4 M20 8.6 V6.2 M21.4 8.6 V7 M22.8 8.6 V5.8 M24.2 8.6 V7.2 M25.6 8.6 V6.6" stroke={ACCENT} strokeWidth="0.7" />
      <circle cx="22" cy="15.6" r="3.9" {...S} /><circle cx="22" cy="15.6" r="1.4" {...A} strokeWidth="1" />
      <path d="M7 15 V7 L12 5.8 V13.8" {...F} /><circle cx="6" cy="15" r="1.3" fill={FAINT} /><circle cx="11" cy="13.8" r="1.3" fill={FAINT} />
    </>
  ),
  // A mixing desk with its faders.
  studio: (
    <>
      {[9, 16, 23, 30, 37].map(x => <path key={x} d={`M${x} 4 V20`} {...F} />)}
      {[[9, 14], [16, 8], [23, 11], [30, 16], [37, 9]].map(([x, y], i) => (
        <rect key={x} x={x - 2} y={y - 1.2} width="4" height="2.4" rx="0.6" fill={i === 1 ? ACCENT : SOFT} />
      ))}
    </>
  ),
  // A hum (a wave from the left) turning into notes on a staff.
  humBeat: (
    <>
      <path d="M4 12 Q6 7 8 12 T12 12 T16 12" {...A} />
      <path d="M19 7 H40 M19 12 H40 M19 17 H40" {...F} />
      <rect x="21" y="10.8" width="5" height="2.4" rx="0.6" fill={ACCENT} />
      <rect x="28" y="5.8" width="4" height="2.4" rx="0.6" fill={INK} />
      <rect x="34" y="15.8" width="5" height="2.4" rx="0.6" fill={SOFT} />
    </>
  ),
  // A live screen sending out its signal.
  stream: (
    <>
      <rect x="7" y="5" width="22" height="14" rx="1.2" {...S} />
      <circle cx="11" cy="8.5" r="1.2" fill={ACCENT} /><path d="M13.5 8.5 H18" {...F} />
      <path d="M33 9 Q35 12 33 15 M36 7 Q39.5 12 36 17" {...A} />
    </>
  ),
  // A video with its progress bar.
  // A webcam dot over a small screen of script, the reading line marked.
  teleprompter: (
    <>
      <circle cx="22" cy="3.2" r="1.2" fill={SOFT} />
      <rect x="9" y="6" width="26" height="15" rx="1" {...S} />
      <path d="M14 10.5 H30 M15 14 H29 M16 17.5 H28" {...F} />
      <path d="M9.6 14 H12 M32 14 H34.4" {...A} />
    </>
  ),
  youtube: (
    <>
      <rect x="4" y="4" width="24" height="16" rx="1.5" {...S} />
      <path d="M13.5 8.5 L19 12 L13.5 15.5 Z" fill={INK} />
      <path d="M7 17.5 H25" {...H} /><path d="M7 17.5 H15" {...A} />
    </>
  ),
  // Messages going back and forth.
  whatsapp: (
    <>
      <rect x="4" y="4" width="16" height="6" rx="2" {...S} />
      <rect x="10" y="12" width="17" height="6" rx="2" {...A} />
      <path d="M7 7 H16 M13 15 H23" {...H} />
    </>
  ),
  // An envelope for your own mail server.
  mailcow: (
    <>
      <rect x="5" y="6" width="22" height="13" rx="1" {...S} />
      <path d="M5.5 6.5 L16 14 L26.5 6.5" {...A} />
    </>
  ),
  // A shop front with modules on the shelf.
  marketplace: (
    <>
      <path d="M8 9 L10 4 H34 L36 9 Z" {...S} />
      <path d="M8 9 Q11 11.5 14 9 Q17 11.5 20 9 Q23 11.5 26 9 Q29 11.5 32 9 Q35 11.5 36 9" {...F} />
      <path d="M10 11 V20 H34 V11" {...S} />
      <rect x="14" y="14" width="5" height="5" rx="0.8" {...F} /><rect x="21" y="14" width="5" height="5" rx="0.8" {...A} /><rect x="28" y="14" width="3.5" height="5" rx="0.8" {...F} />
    </>
  ),
  // Switches: one on, one off.
  appearance: (
    <>
      <rect x="10" y="5" width="12" height="6" rx="3" fill={ACCENT} /><circle cx="19" cy="8" r="2.1" fill="var(--surface-sunken)" />
      <rect x="10" y="13.5" width="12" height="6" rx="3" {...S} /><circle cx="13" cy="16.5" r="2.1" fill={SOFT} />
      <path d="M26 8 H35 M26 16.5 H33" {...F} />
    </>
  ),
  // A search box with its glass.
  searchEngine: (
    <>
      <rect x="4" y="8" width="24" height="8" rx="4" {...S} />
      <circle cx="9" cy="11.6" r="2" {...A} strokeWidth="1" /><path d="M10.5 13.1 L12 14.6" {...A} strokeWidth="1" />
      <path d="M15 12 H24" {...F} />
    </>
  ),
  // Your own module: a sandboxed box with parts plugged in.
  module: (
    <>
      <rect x="9" y="4" width="26" height="16" rx="2" {...F} strokeDasharray="1.8 1.4" />
      <rect x="13" y="8" width="8" height="8" rx="1" {...S} /><rect x="23" y="8" width="8" height="3.5" rx="1" {...A} />
      <rect x="23" y="12.5" width="8" height="3.5" rx="1" {...S} />
    </>
  ),
  // A new module waiting to be described.
  makeModule: (
    <>
      <rect x="9" y="4" width="26" height="16" rx="2" {...F} strokeDasharray="1.8 1.4" />
      <path d="M22 8 V16 M18 12 H26" {...A} strokeWidth="1.5" />
    </>
  ),
};
