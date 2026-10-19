/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { S, F, A, H, INK, SOFT, FAINT, ACCENT } from './kit.js';

// Work windows. Covers for branded windows keep the right third clear: the
// service's own mark sits there (ModuleCover.jsx).
export const WORK_COVERS = {
  // A short list, the first item ticked.
  todos: (
    <>
      <rect x="8" y="4.5" width="4" height="4" rx="0.8" {...A} /><path d="M8.8 6.6 L9.9 7.6 L11.4 5.5" {...A} strokeWidth="1" />
      <rect x="8" y="10" width="4" height="4" rx="0.8" {...S} /><rect x="8" y="15.5" width="4" height="4" rx="0.8" {...S} />
      <path d="M15 6.5 H28" {...H} /><path d="M15 12 H34 M15 17.5 H30" {...F} />
    </>
  ),
  // A node canvas: Start fires into two agent bots, a check diamond picks a
  // way, and the live wire glows into the result card.
  workflow: (
    <>
      <path d="M3.5 9.5 L8 12 L3.5 14.5 Z" fill={ACCENT} />
      <path d="M8.5 12 C10.5 12 10 6.5 12.5 6.5 M8.5 12 C10.5 12 10 17.5 12.5 17.5" {...F} />
      <rect x="12.5" y="4" width="6" height="5" rx="1.2" {...S} /><circle cx="14.6" cy="6.5" r="0.55" fill={INK} /><circle cx="16.4" cy="6.5" r="0.55" fill={INK} />
      <rect x="12.5" y="15" width="6" height="5" rx="1.2" {...S} /><circle cx="14.6" cy="17.5" r="0.55" fill={INK} /><circle cx="16.4" cy="17.5" r="0.55" fill={INK} />
      <path d="M18.5 6.5 C21 6.5 21 12 23 12 M18.5 17.5 C21 17.5 21 12 23 12" {...F} />
      <path d="M26 8.5 L29.5 12 L26 15.5 L22.5 12 Z" {...S} />
      <path d="M29.5 12 H33" {...A} strokeDasharray="1.4 1" />
      <rect x="33" y="7.5" width="8" height="9" rx="1.2" {...A} /><path d="M35 10.5 H39 M35 13 H38" {...H} />
    </>
  ),
  // A clock face beside the day's slots.
  scheduler: (
    <>
      <circle cx="13" cy="12" r="7.5" {...S} />
      <path d="M13 7.5 V12 L16 14" {...S} /><circle cx="13" cy="12" r="0.9" fill={INK} />
      <path d="M25 6 H38 M25 12 H38 M25 18 H38" {...H} />
      <rect x="25" y="8" width="9" height="3" rx="0.6" fill={ACCENT} /><rect x="29" y="14" width="8" height="3" rx="0.6" fill={FAINT} />
    </>
  ),
  // Three columns of cards, one on the move.
  operationsBoard: (
    <>
      <path d="M17 4 V20 M27 4 V20" {...H} />
      <rect x="7" y="5" width="8" height="4" rx="0.8" {...F} /><rect x="7" y="11" width="8" height="4" rx="0.8" {...F} />
      <rect x="18" y="7" width="8" height="4" rx="0.8" {...A} />
      <rect x="29" y="5" width="8" height="4" rx="0.8" {...S} /><rect x="29" y="11" width="8" height="4" rx="0.8" {...S} /><rect x="29" y="17" width="8" height="3" rx="0.8" {...S} />
    </>
  ),
  // Tasks handed out, one running.
  julesTasks: (
    <>
      <path d="M6 6 H22 M6 12 H22 M6 18 H18" {...F} />
      <circle cx="25" cy="6" r="1.1" fill={SOFT} /><circle cx="25" cy="12" r="1.6" {...A} /><circle cx="25" cy="12" r="0.6" fill={ACCENT} />
      <circle cx="21" cy="18" r="1.1" fill={FAINT} />
    </>
  ),
  // A month, today marked.
  calendar: (
    <>
      <rect x="10" y="4" width="24" height="17" rx="1.5" {...S} /><path d="M10 8.5 H34" {...S} />
      <path d="M15 2.8 V5.5 M29 2.8 V5.5" {...S} />
      {[0, 1, 2, 3, 4].map(c => [0, 1, 2].map(r => (
        <rect key={`${c}${r}`} x={12.6 + c * 4} y={10.5 + r * 3.4} width="2" height="2" rx="0.3" fill={c === 3 && r === 1 ? ACCENT : FAINT} />
      )))}
    </>
  ),
  // A target with leads closing in on the centre.
  leadHound: (
    <>
      <circle cx="14" cy="12" r="8" {...F} /><circle cx="14" cy="12" r="4.8" {...S} /><circle cx="14" cy="12" r="1.8" fill={ACCENT} />
      <circle cx="24" cy="6" r="1" fill={SOFT} /><circle cx="25" cy="17" r="1" fill={SOFT} /><circle cx="5" cy="5" r="0.8" fill={FAINT} />
      <path d="M23.2 6.6 L18 10" {...H} />
    </>
  ),
  // A price tag under a watching eye.
  auctionWatcher: (
    <>
      <path d="M6 13 L13 6 H20 V13 L13 20 Z" {...F} /><circle cx="17" cy="9" r="1.2" fill={ACCENT} />
      <path d="M24 12 Q30 6 36 12 Q30 18 24 12 Z" {...S} /><circle cx="30" cy="12" r="1.8" fill={ACCENT} />
      <path d="M9 13.5 L13.5 9" {...H} />
    </>
  ),
  // A glass over a page of sources.
  research: (
    <>
      <path d="M5 6 H17 M5 10 H14 M5 14 H16 M5 18 H12" {...F} />
      <circle cx="21" cy="10" r="5" {...S} /><path d="M24.6 13.6 L28 17" {...S} strokeWidth="1.8" />
      <path d="M19 9 H23 M19 11.3 H22" {...A} strokeWidth="1" />
    </>
  ),
  // A sheet with the formula bar on top.
  sheets: (
    <>
      <rect x="6" y="3.5" width="32" height="3.5" rx="0.8" {...F} /><path d="M8.5 5.25 H11" {...A} strokeWidth="1" />
      <rect x="6" y="9" width="32" height="12" rx="1" {...S} />
      <path d="M6 13 H38 M6 17 H38 M14 9 V21 M22 9 V21 M30 9 V21" {...H} />
      <rect x="22" y="13" width="8" height="4" fill={ACCENT} />
    </>
  ),
  // People queued as cards, the next one up in accent.
  leads: (
    <>
      <rect x="6" y="4" width="32" height="5" rx="1" {...A} /><circle cx="9.5" cy="6.5" r="1.4" fill={ACCENT} /><path d="M13 6.5 H27" {...S} />
      <rect x="6" y="11" width="32" height="4.5" rx="1" {...F} /><circle cx="9.5" cy="13.25" r="1.3" fill={SOFT} /><path d="M13 13.25 H24" {...H} />
      <rect x="6" y="17.5" width="32" height="4" rx="1" {...F} /><circle cx="9.5" cy="19.5" r="1.2" fill={FAINT} /><path d="M13 19.5 H21" {...H} />
    </>
  ),
  // A line over bars, the last point lit.
  analyticsBoard: (
    <>
      <path d="M6 20 H38" {...H} />
      <path d="M9 20 V15 M15 20 V13 M21 20 V16 M27 20 V11 M33 20 V12" {...F} strokeWidth="2.4" strokeLinecap="butt" />
      <path d="M7 13 L13 9 L19 11 L25 6 L35 5" {...S} /><circle cx="35" cy="5" r="1.5" fill={ACCENT} />
    </>
  ),
  // A steady heartbeat across a row of uptime ticks.
  reliability: (
    <>
      <path d="M5 11 H15 L17.5 5 L21 17 L23.5 9 L25.5 11 H39" {...A} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={6 + i * 2.75} y="18" width="1.8" height="3" rx="0.4" fill={i === 8 ? INK : FAINT} />
      ))}
    </>
  ),
  // A training loss curve falling, best point marked.
  mlops_dashboard: (
    <>
      <path d="M6 4 V20 H38" {...H} />
      <path d="M8 6 C12 14 17 16 24 17 C29 17.6 33 17.8 37 18" {...S} />
      <path d="M8 9 C13 15 18 17.5 37 19" {...F} strokeDasharray="1.4 1.2" />
      <circle cx="28" cy="17.3" r="1.5" fill={ACCENT} />
    </>
  ),
  // Where a thing came from: a trail back to its origin.
  provenance_explorer: (
    <>
      <circle cx="8" cy="12" r="2.2" fill={ACCENT} />
      <path d="M10.2 12 H17 M17 12 L22 6.5 M17 12 L22 17.5 M24 6.5 H30 M24 17.5 L30 13.5 M24 17.5 L30 20" {...F} />
      <circle cx="17" cy="12" r="1.4" fill={SOFT} /><circle cx="23" cy="6.5" r="1.4" fill={SOFT} /><circle cx="23" cy="17.5" r="1.4" fill={SOFT} />
      <rect x="31" y="4.5" width="7" height="4" rx="0.8" {...S} /><rect x="31" y="11.5" width="7" height="4" rx="0.8" {...S} /><rect x="31" y="18" width="7" height="3.5" rx="0.8" {...S} />
    </>
  ),
  // A house beside the four groups a ready-made real estate board opens with.
  realEstateBoard: (
    <>
      <path d="M5 12 L12 5.5 L19 12 M7 10.5 V19 H17 V10.5" {...S} />
      <rect x="10.5" y="14" width="3" height="5" rx="0.4" {...A} />
      <rect x="23" y="5" width="7" height="6" rx="0.8" {...S} /><rect x="32" y="5" width="7" height="6" rx="0.8" {...F} />
      <rect x="23" y="13" width="7" height="6" rx="0.8" {...F} /><rect x="32" y="13" width="7" height="6" rx="0.8" {...F} />
    </>
  ),
  // Code brackets beside the four groups of the Developer board.
  developerBoard: (
    <>
      <path d="M9 7.5 L5 12 L9 16.5 M15 7.5 L19 12 L15 16.5" {...S} />
      <path d="M13.2 6.5 L10.8 17.5" {...A} />
      <rect x="23" y="5" width="7" height="6" rx="0.8" {...S} /><rect x="32" y="5" width="7" height="6" rx="0.8" {...F} />
      <rect x="23" y="13" width="7" height="6" rx="0.8" {...F} /><rect x="32" y="13" width="7" height="6" rx="0.8" {...F} />
    </>
  ),
  // An editor window split like VS Code: side bar, code, terminal, side panel.
  codeWorkspaceBoard: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" {...S} />
      <path d="M8 5 V19 M16.5 5 V19 M8 15 H16.5" {...F} />
      <path d="M9.5 8 H13 M9.5 10.5 H14.5" {...A} />
      <rect x="23" y="5" width="7" height="6" rx="0.8" {...S} /><rect x="32" y="5" width="7" height="6" rx="0.8" {...F} />
      <rect x="23" y="13" width="7" height="6" rx="0.8" {...F} /><rect x="32" y="13" width="7" height="6" rx="0.8" {...F} />
    </>
  ),
  // Four agents around one team room.
  agentTeamBoard: (
    <>
      <circle cx="12" cy="12" r="2.4" {...A} />
      <circle cx="7" cy="7" r="1.6" {...S} /><circle cx="17" cy="7" r="1.6" {...S} />
      <circle cx="7" cy="17" r="1.6" {...S} /><circle cx="17" cy="17" r="1.6" {...S} />
      <path d="M8.2 8.2 L10.3 10.3 M15.8 8.2 L13.7 10.3 M8.2 15.8 L10.3 13.7 M15.8 15.8 L13.7 13.7" {...F} />
      <rect x="23" y="5" width="7" height="6" rx="0.8" {...S} /><rect x="32" y="5" width="7" height="6" rx="0.8" {...F} />
      <rect x="23" y="13" width="7" height="6" rx="0.8" {...F} /><rect x="32" y="13" width="7" height="6" rx="0.8" {...F} />
    </>
  ),
  // A painter's palette beside the four groups of the Creative Studio board.
  creativeBoard: (
    <>
      <path d="M12 5.5 C7.5 5.5 5 8.5 5 12 C5 15.6 7.8 18.5 11.5 18.5 C13 18.5 13.2 17.2 12.6 16.4 C12 15.6 12.4 14.5 13.6 14.5 H15.5 C17.6 14.5 19 13 19 11 C19 7.8 16 5.5 12 5.5 Z" {...S} />
      <circle cx="9" cy="10.5" r="1" {...A} /><circle cx="12.5" cy="8.5" r="1" {...F} /><circle cx="15.8" cy="10.5" r="1" {...F} />
      <rect x="23" y="5" width="7" height="6" rx="0.8" {...S} /><rect x="32" y="5" width="7" height="6" rx="0.8" {...F} />
      <rect x="23" y="13" width="7" height="6" rx="0.8" {...F} /><rect x="32" y="13" width="7" height="6" rx="0.8" {...F} />
    </>
  ),
  // A shop front with an awning beside the four groups of the Small Business board.
  smallBusinessBoard: (
    <>
      <path d="M5 9.5 L6.5 5.5 H17.5 L19 9.5 Z M6 9.5 V18.5 H18 V9.5" {...S} />
      <rect x="10.5" y="13" width="3" height="5.5" rx="0.4" {...A} />
      <rect x="23" y="5" width="7" height="6" rx="0.8" {...S} /><rect x="32" y="5" width="7" height="6" rx="0.8" {...F} />
      <rect x="23" y="13" width="7" height="6" rx="0.8" {...F} /><rect x="32" y="13" width="7" height="6" rx="0.8" {...F} />
    </>
  ),
  // A blueprint card: the name bar, the ID boxed in accent, three lines.
  blueprints: (
    <>
      <rect x="6" y="3.5" width="32" height="17" rx="1.5" {...S} />
      <path d="M9.5 7 H27" {...H} />
      <rect x="9" y="9.5" width="13" height="3.5" rx="0.6" {...A} />
      <path d="M10 16.5 H20 M24 16.5 H34 M24 12 H34" {...F} />
    </>
  ),
};
