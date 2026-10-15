/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { S, F, A, H, INK, SOFT, FAINT, ACCENT } from './kit.js';

// Censai Office, Censai Creative and the YorWare Suite.
export const SUITE_COVERS = {
  // A grid with one picked cell and a small bar chart.
  officeSheets: (
    <>
      <rect x="5" y="4" width="22" height="16" rx="1" {...S} />
      <path d="M5 8 H27 M5 12 H27 M5 16 H27 M11 4 V20 M19 4 V20" {...H} />
      <rect x="11" y="8" width="8" height="4" {...A} />
      <path d="M31 20 V14 M35 20 V9 M39 20 V12" {...F} strokeWidth="2.4" strokeLinecap="butt" />
      <path d="M35 20 V9" stroke={ACCENT} strokeWidth="2.4" />
    </>
  ),
  // A slide with its title and a chart, thumbnails down the side.
  officeSlides: (
    <>
      <rect x="5" y="4" width="7" height="4.5" rx="0.6" {...A} /><rect x="5" y="10" width="7" height="4.5" rx="0.6" {...F} /><rect x="5" y="16" width="7" height="4.5" rx="0.6" {...F} />
      <rect x="15" y="4" width="24" height="16" rx="1" {...S} />
      <path d="M18 8 H30" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19 17 V14 M23 17 V12 M27 17 V13.5" {...F} strokeWidth="2" strokeLinecap="butt" />
      <path d="M31 17 V11" stroke={ACCENT} strokeWidth="2" />
    </>
  ),
  // A photo of hills under a sun, crop corners around it.
  creativePhoto: (
    <>
      <path d="M8 7 V4 H11 M33 4 H36 V7 M36 17 V20 H33 M11 20 H8 V17" {...A} />
      <path d="M11 17 L18 10 L23 15 L27 11.5 L33 17 Z" {...S} />
      <circle cx="28" cy="7.5" r="1.8" fill={SOFT} />
    </>
  ),
  // A pen curve with its anchors and one handle pulled out.
  creativeVector: (
    <>
      <path d="M6 18 C12 4 26 4 38 14" {...S} />
      <path d="M17 7 L27 5.5" {...H} />
      <rect x="5" y="16.5" width="3" height="3" fill={INK} /><rect x="36.5" y="12.5" width="3" height="3" fill={INK} />
      <rect x="20.5" y="5" width="3" height="3" {...A} fill="var(--surface-sunken)" />
      <circle cx="17" cy="7" r="1" fill={SOFT} /><circle cx="27" cy="5.5" r="1" fill={SOFT} />
    </>
  ),
  // Clips on two tracks, the playhead between them.
  creativeVideo: (
    <>
      <rect x="5" y="6" width="12" height="4" rx="1" {...S} /><rect x="18" y="6" width="17" height="4" rx="1" {...S} />
      <rect x="5" y="13" width="20" height="4" rx="1" {...F} /><rect x="26" y="13" width="12" height="4" rx="1" {...F} />
      <path d="M22 3.5 V20.5" {...A} /><path d="M20.3 3.2 H23.7 L22 5 Z" fill={ACCENT} />
    </>
  ),
  // A page of text with the caret mid-sentence.
  officeDocs: (
    <>
      <rect x="12" y="3" width="20" height="18" rx="1" {...S} />
      <path d="M15 7 H27" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M15 10.5 H29 M15 13 H29 M15 15.5 H22 M15 18 H26" {...F} />
      <path d="M23.5 14 V17" {...A} />
    </>
  ),
  // A paper with a folded corner and a highlighted line.
  yorPdf: (
    <>
      <path d="M13 3 H27 L31 7 V21 H13 Z" {...S} /><path d="M27 3 V7 H31" {...S} />
      <path d="M16 9 H25 M16 15 H28 M16 18 H23" {...F} />
      <rect x="15.5" y="11" width="13" height="2.2" rx="0.4" fill={ACCENT} />
    </>
  ),
  // A wall of photos, one picked.
  yorPhotos: (
    <>
      <rect x="5" y="4" width="10" height="7" rx="1" {...F} /><rect x="17" y="4" width="10" height="7" rx="1" {...A} /><rect x="29" y="4" width="10" height="7" rx="1" {...F} />
      <rect x="5" y="13" width="10" height="7" rx="1" {...F} /><rect x="17" y="13" width="10" height="7" rx="1" {...F} /><rect x="29" y="13" width="10" height="7" rx="1" {...F} />
      <path d="M18.5 9.5 L21 7 L23 9 L24 8 L25.5 9.5" {...S} />
      <path d="M6.5 18.5 L9 16 L13.5 18.5 M30.5 9.5 L33 7 L37.5 9.5" {...H} />
    </>
  ),
  // A two-page spread with columns and a picture block.
  yorLayout: (
    <>
      <rect x="5" y="4" width="17" height="16" rx="0.5" {...S} /><rect x="22" y="4" width="17" height="16" rx="0.5" {...S} />
      <rect x="8" y="7" width="11" height="6" fill={FAINT} />
      <path d="M8 15.5 H19 M8 17.5 H15" {...H} />
      <path d="M25 7 H36" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M25 10 H29.5 M25 12.5 H29.5 M25 15 H29.5 M25 17.5 H29.5 M31.5 10 H36 M31.5 12.5 H36 M31.5 15 H36" {...H} />
    </>
  ),
  // Boxes and a decision diamond joined by arrows.
  yorDiagrams: (
    <>
      <rect x="4" y="9" width="9" height="6" rx="1" {...S} />
      <path d="M22 6.5 L27.5 12 L22 17.5 L16.5 12 Z" {...A} />
      <rect x="31" y="3.5" width="9" height="6" rx="1" {...S} /><rect x="31" y="14.5" width="9" height="6" rx="1" {...S} />
      <path d="M13 12 H16.5 M27.5 12 H29 V6.5 H31 M29 12 V17.5 H31" {...F} />
    </>
  ),
  // A wire cube turning on its orbit.
  yor3d: (
    <>
      <ellipse cx="22" cy="13" rx="15" ry="5" {...A} strokeDasharray="2 1.6" />
      <path d="M22 4 L29 8 V16 L22 20 L15 16 V8 Z" {...S} />
      <path d="M15 8 L22 12 L29 8 M22 12 V20" {...F} />
    </>
  ),
  // A block with the move handles on it.
  yorThreeEditor: (
    <>
      <path d="M12 9 L18 6 L24 9 V16 L18 19 L12 16 Z" {...S} /><path d="M12 9 L18 12 L24 9 M18 12 V19" {...F} />
      <path d="M18 12 H35" {...A} /><path d="M35 10.5 L38 12 L35 13.5 Z" fill={ACCENT} />
      <path d="M18 12 V3.5" {...S} /><path d="M16.6 4.5 L18 2 L19.4 4.5 Z" fill={SOFT} />
      <path d="M18 12 L27 18" {...F} />
    </>
  ),
  // A part drawn with a measured edge.
  yorCad: (
    <>
      <path d="M8 18 V8 H20 V12 H34 V18 Z" {...S} />
      <circle cx="14" cy="13" r="2" {...S} />
      <path d="M8 21 H34 M8 19.5 V22.5 M34 19.5 V22.5" {...A} strokeWidth="0.9" />
      <path d="M37 8 V18 M35.5 8 H38.5 M35.5 18 H38.5" {...F} strokeWidth="0.8" />
      <path d="M12 4.5 H30" {...H} strokeDasharray="1.4 1.2" />
    </>
  ),
  // A ledger page with its rows, and the year's line going up beside it.
  yorBooks: (
    <>
      <rect x="5" y="4" width="16" height="16" rx="1" {...S} />
      <path d="M8 8 H18 M8 12 H18 M8 16 H18" {...H} />
      <path d="M15 6 V18" {...F} />
      <path d="M25 18 L30 14 L34 15.5 L39 7" {...A} />
      <path d="M25 20 H39" {...F} />
    </>
  ),
};
