/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { S, F, A, H, INK, SOFT, FAINT, ACCENT } from './kit.js';

// Build windows. Branded ones (Docker, GitHub, Figma, n8n, Ollama) leave the
// right third for the service's mark.
export const BUILD_COVERS = {
  // Diagram 18: a row of seven host tiles, a cloud above the lit one.
  hosting: (
    <>
      <rect x="4" y="13" width="5" height="6" rx="1" {...S} /><rect x="10" y="13" width="5" height="6" rx="1" {...S} /><rect x="16" y="13" width="5" height="6" rx="1" {...A} />
      <rect x="22" y="13" width="5" height="6" rx="1" {...S} /><rect x="28" y="13" width="5" height="6" rx="1" {...S} /><rect x="34" y="13" width="5" height="6" rx="1" {...S} />
      <path d="M14 9 Q14 5.5 17.5 5.5 Q19 3 22 4.5 Q25.5 4.5 25.5 8 Q27 9 25.5 10 H15 Q13.5 10 14 9 Z" {...A} />
      <path d="M18.5 10 V13" {...F} />
    </>
  ),
  // A prompt and a blinking block cursor.
  terminal: (
    <>
      <rect x="5" y="4" width="34" height="16" rx="1.5" {...S} />
      <path d="M9 9 L12 11.5 L9 14" {...S} /><path d="M14.5 14 H22" {...F} />
      <rect x="24" y="11.5" width="3.5" height="3.5" fill={ACCENT} />
    </>
  ),
  // Indented code between braces, the edited line lit.
  code_editor: (
    <>
      <path d="M9 4 Q6 4 6 7 V10 Q6 12 4.5 12 Q6 12 6 14 V17 Q6 20 9 20" {...S} />
      <path d="M35 4 Q38 4 38 7 V10 Q38 12 39.5 12 Q38 12 38 14 V17 Q38 20 35 20" {...S} />
      <path d="M11 7 H22 M15 15 H29 M11 18 H17" {...F} /><path d="M15 11 H31" {...A} />
    </>
  ),
  // Folders, the open one in accent.
  files: (
    <>
      <path d="M6 7 H11 L12.5 8.5 H19 V17 H6 Z" {...F} />
      <path d="M15 5.5 H20 L21.5 7 H30 V19 H15 Z" {...S} />
      <path d="M24 10 H29 L30.5 11.5 H38 V20 H24 Z" {...A} />
    </>
  ),
  // A plain page with a heading.
  doc: (
    <>
      <path d="M13 3 H27 L31 7 V21 H13 Z" {...S} /><path d="M27 3 V7 H31" {...S} />
      <path d="M16 8 H24" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 11.5 H28 M16 14.5 H28 M16 17.5 H23" {...F} />
    </>
  ),
  // A web page laid out in blocks, shared live.
  htmlPreview: (
    <>
      <rect x="5" y="3.5" width="34" height="17" rx="1.5" {...S} /><path d="M5 7 H39" {...H} />
      <rect x="8" y="9.5" width="13" height="8" rx="0.8" fill={FAINT} />
      <path d="M24 10.5 H35 M24 13.5 H33" {...F} /><rect x="24" y="15.5" width="7" height="2.5" rx="1.2" fill={ACCENT} />
    </>
  ),
  // A browser window and its address bar.
  browser: (
    <>
      <rect x="5" y="3.5" width="34" height="17" rx="1.5" {...S} />
      <circle cx="8.5" cy="7" r="0.8" fill={FAINT} /><circle cx="11" cy="7" r="0.8" fill={FAINT} />
      <rect x="14" y="5.3" width="22" height="3.4" rx="1.7" {...A} strokeWidth="0.9" />
      <path d="M9 12.5 H35 M9 15.5 H30 M9 18 H22" {...H} />
    </>
  ),
  // A computer running inside a window.
  vm: (
    <>
      <rect x="9" y="3.5" width="26" height="14" rx="1.5" {...S} /><path d="M18 21 H26 M22 17.5 V21" {...S} />
      <rect x="13" y="6.5" width="18" height="8" rx="0.8" {...A} /><path d="M15.5 9 H22" {...F} />
    </>
  ),
  // A borderless block with its selection handles.
  designBlock: (
    <>
      <rect x="9" y="5" width="26" height="14" {...A} strokeWidth="0.8" strokeDasharray="1.6 1.2" />
      {[[9, 5], [35, 5], [9, 19], [35, 19]].map(([x, y]) => (
        <rect key={`${x}${y}`} x={x - 1.2} y={y - 1.2} width="2.4" height="2.4" fill="var(--surface-sunken)" stroke={ACCENT} strokeWidth="0.8" />
      ))}
      <path d="M13 9 H25" stroke={INK} strokeWidth="1.4" strokeLinecap="round" /><path d="M13 12.5 H31 M13 15 H27" {...F} />
    </>
  ),
  // Shipping containers stacked up.
  containers: (
    <>
      <rect x="5" y="14" width="10" height="6" rx="0.6" {...S} /><rect x="16" y="14" width="10" height="6" rx="0.6" {...S} />
      <rect x="10.5" y="7" width="10" height="6" rx="0.6" {...A} />
      <path d="M8 15.5 V18.5 M11 15.5 V18.5 M19 15.5 V18.5 M22 15.5 V18.5 M13.5 8.5 V11.5 M17.5 8.5 V11.5" {...H} />
    </>
  ),
  // Play, and a server that's up.
  devServer: (
    <>
      <path d="M8 6 L18 12 L8 18 Z" {...S} />
      <rect x="22" y="5" width="16" height="5.5" rx="1" {...F} /><rect x="22" y="13.5" width="16" height="5.5" rx="1" {...F} />
      <circle cx="25.5" cy="7.75" r="1.1" fill={ACCENT} /><circle cx="25.5" cy="16.25" r="1.1" fill={FAINT} />
      <path d="M29 7.75 H35 M29 16.25 H34" {...H} />
    </>
  ),
  // Tool settings as three sliders.
  toolchainSettings: (
    <>
      <path d="M7 7 H37 M7 12 H37 M7 17 H37" {...F} />
      <rect x="25" y="5" width="3" height="4" rx="0.8" fill={SOFT} /><rect x="12" y="10" width="3" height="4" rx="0.8" fill={ACCENT} />
      <rect x="31" y="15" width="3" height="4" rx="0.8" fill={SOFT} />
    </>
  ),
  // Something coming in to become a window.
  windowImporter: (
    <>
      <rect x="18" y="4" width="21" height="16" rx="1.5" {...S} /><path d="M18 8 H39" {...H} />
      <path d="M5 12 H26" {...A} /><path d="M23 9 L26.5 12 L23 15" {...A} />
      <path d="M8 6 H13 M8 18 H12" {...F} />
    </>
  ),
  // Branches meeting in a merge.
  githubConsole: (
    <>
      <path d="M6 7 H25 M10 7 Q14 7 14 12 Q14 17 18 17 H22 Q25 17 25 13 V7" {...F} />
      <circle cx="6" cy="7" r="1.5" fill={SOFT} /><circle cx="14" cy="7" r="1.5" fill={SOFT} /><circle cx="18" cy="17" r="1.5" fill={SOFT} />
      <circle cx="25" cy="7" r="2" fill={ACCENT} />
    </>
  ),
  // Artboards on a canvas with a pen.
  figma: (
    <>
      <rect x="5" y="5" width="10" height="13" rx="0.8" {...S} /><rect x="17" y="5" width="9" height="7" rx="0.8" {...F} />
      <path d="M7.5 8 H12.5 M7.5 10.5 H11" {...H} />
      <rect x="17" y="14" width="9" height="4" rx="2" {...A} />
    </>
  ),
  // Nodes of an automation, wired up.
  n8n: (
    <>
      <rect x="4" y="9.5" width="6" height="5" rx="1.2" {...S} /><rect x="14" y="4.5" width="6" height="5" rx="1.2" {...S} />
      <rect x="14" y="14.5" width="6" height="5" rx="1.2" {...S} /><circle cx="25.5" cy="12" r="2.4" {...A} />
      <path d="M10 12 Q12 7 14 7 M10 12 Q12 17 14 17 M20 7 Q22.5 7 23.5 10.5 M20 17 Q22.5 17 23.5 13.5" {...F} />
    </>
  ),
  // A model running on your own machine.
  ollama: (
    <>
      <rect x="5" y="4" width="20" height="12" rx="1.2" {...S} /><path d="M12 19.5 H18 M15 16 V19.5" {...S} />
      <path d="M9 7.5 H21 M9 10 H21 M9 12.5 H17" {...F} />
      <rect x="18" y="11.3" width="3" height="2.4" fill={ACCENT} />
    </>
  ),
  // A dock of apps, one running.
  dockapp: (
    <>
      <rect x="5" y="9" width="34" height="9" rx="3" {...F} />
      <rect x="8" y="10.8" width="5.4" height="5.4" rx="1.4" {...S} /><rect x="15.5" y="10.8" width="5.4" height="5.4" rx="1.4" {...S} />
      <rect x="23" y="10.8" width="5.4" height="5.4" rx="1.4" {...A} /><rect x="30.5" y="10.8" width="5.4" height="5.4" rx="1.4" {...S} />
      <circle cx="25.7" cy="20" r="0.8" fill={ACCENT} />
    </>
  ),
};
