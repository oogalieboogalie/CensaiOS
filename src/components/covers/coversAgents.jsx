/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { S, F, A, H, INK, SOFT, FAINT, ACCENT } from './kit.js';

// Chat and agent windows.
export const AGENT_COVERS = {
  // Diagram 03: three agents on one shared line, the router below sends a job up to one of them.
  agentRouter: (
    <>
      <rect x="5" y="3" width="9" height="5" rx="1" {...S} /><rect x="17.5" y="3" width="9" height="5" rx="1" {...A} /><rect x="30" y="3" width="9" height="5" rx="1" {...S} />
      <path d="M5 10.5 H39" {...H} />
      <rect x="14" y="15" width="16" height="6" rx="1.2" {...S} /><path d="M17 18 H23" {...F} />
      <path d="M22 15 V8.5" {...A} />
    </>
  ),
  // Two speech bubbles, the answer in accent.
  chat: (
    <>
      <path d="M7 5 H23 Q25 5 25 7 V12 Q25 14 23 14 H12 L9 16.5 V14 H7 Q5 14 5 12 V7 Q5 5 7 5 Z" {...S} />
      <path d="M9 8.5 H20 M9 11 H16" {...F} />
      <path d="M21 11 H37 Q39 11 39 13 V17 Q39 19 37 19 H35 V21 L32 19 H21 Q19 19 19 17 V13 Q19 11 21 11 Z" {...A} />
      <circle cx="25" cy="15" r="0.9" fill={ACCENT} /><circle cx="29" cy="15" r="0.9" fill={ACCENT} /><circle cx="33" cy="15" r="0.9" fill={ACCENT} />
    </>
  ),
  // Three people around one conversation.
  groupChat: (
    <>
      <circle cx="10" cy="8" r="2.4" {...S} /><path d="M6 15 Q10 10.5 14 15" {...S} />
      <circle cx="34" cy="8" r="2.4" {...S} /><path d="M30 15 Q34 10.5 38 15" {...S} />
      <circle cx="22" cy="6.5" r="2.4" {...A} /><path d="M18 13.5 Q22 9 26 13.5" {...A} />
      <path d="M14 19 H30" {...F} /><path d="M17 21 H27" {...H} />
    </>
  ),
  // A team card: group badge and name, member rows, a milestones box.
  group: (
    <>
      <rect x="5" y="3" width="34" height="18" rx="2" {...S} />
      <circle cx="10" cy="7.5" r="2.4" {...A} /><path d="M14.5 7.5 H24" {...S} />
      <path d="M8 12 H20 M8 15 H20 M8 18 H20" {...F} />
      <rect x="24" y="11" width="12" height="8" rx="1" {...F} />
      <circle cx="27" cy="14" r="0.9" fill={ACCENT} /><path d="M29 14 H34 M27 16.5 H32" {...H} />
    </>
  ),
  // An agent's card with three tuning sliders.
  agentDesigner: (
    <>
      <rect x="6" y="4" width="13" height="16" rx="2" {...S} />
      <circle cx="12.5" cy="9.5" r="2.4" {...S} /><path d="M8.5 17 Q12.5 12.5 16.5 17" {...S} />
      <path d="M24 7 H39 M24 12 H39 M24 17 H39" {...F} />
      <circle cx="34" cy="7" r="1.4" fill={SOFT} /><circle cx="28" cy="12" r="1.4" fill={ACCENT} /><circle cx="36" cy="17" r="1.4" fill={SOFT} />
    </>
  ),
  // Departments as rooms, avatars at work inside.
  weewoo: (
    <>
      <rect x="5" y="4" width="16" height="7" rx="1" {...F} /><rect x="23" y="4" width="16" height="7" rx="1" {...F} />
      <rect x="5" y="13" width="16" height="7" rx="1" {...F} /><rect x="23" y="13" width="16" height="7" rx="1" {...A} />
      <circle cx="10" cy="7.5" r="1.3" fill={SOFT} /><circle cx="15" cy="7.5" r="1.3" fill={SOFT} />
      <circle cx="31" cy="7.5" r="1.3" fill={SOFT} /><circle cx="13" cy="16.5" r="1.3" fill={SOFT} />
      <circle cx="28" cy="16.5" r="1.3" fill={ACCENT} /><circle cx="34" cy="16.5" r="1.3" fill={ACCENT} />
    </>
  ),
  // A core with modules plugged into its slots.
  exoSkeleton: (
    <>
      <path d="M22 5 L28 8.5 V15.5 L22 19 L16 15.5 V8.5 Z" {...S} />
      <circle cx="22" cy="12" r="2" fill={INK} />
      <path d="M16 12 H12 M28 12 H32 M22 5 V3 M22 19 V21" {...F} />
      <rect x="6" y="9.5" width="6" height="5" rx="1" {...F} /><rect x="32" y="9.5" width="6" height="5" rx="1" fill={ACCENT} stroke="none" />
    </>
  ),
  // Four models racing their answers, one ahead.
  modelArena: (
    <>
      <path d="M6 4 V20" {...H} />
      <path d="M8 6 H24" {...F} strokeWidth="2" /><path d="M8 10 H34" {...A} strokeWidth="2" />
      <path d="M8 14 H20" {...F} strokeWidth="2" /><path d="M8 18 H28" {...F} strokeWidth="2" />
      <path d="M38 4 V20" {...H} strokeDasharray="1.5 1.5" />
    </>
  ),
  // The build order as four steps, and Echo's check mark in accent.
  legion: (
    <>
      <path d="M5 6 H17 M5 10 H21 M5 14 H25 M5 18 H29" {...F} strokeWidth="2" />
      <circle cx="35" cy="12" r="5" {...A} />
      <path d="M32.5 12 L34.4 14 L37.8 10" {...A} />
    </>
  ),
  // A results table: three bars, the leader in accent.
  arenaBenchmarks: (
    <>
      <path d="M5 20 H39" {...H} />
      <path d="M10 20 V12" {...F} strokeWidth="3" /><path d="M19 20 V5" {...A} strokeWidth="3" />
      <path d="M28 20 V9" {...F} strokeWidth="3" /><path d="M35 20 V14" {...F} strokeWidth="3" />
    </>
  ),
  // A terminal with teammate tabs and a waiting cursor.
  agentConsole: (
    <>
      <rect x="5" y="6" width="34" height="14" rx="1.5" {...S} />
      <path d="M5 6 V4.5 Q5 3.5 6 3.5 H13 V6 M13 6 V3.5 H21 V6" {...F} />
      <path d="M9 11 L11.5 13 L9 15" {...S} /><path d="M14 15 H22" {...F} />
      <rect x="24" y="13.5" width="3" height="3" fill={ACCENT} />
    </>
  ),
  // Two panes split by a red line: grey lines on the left, green and red on the right.
  gitDiff: (
    <>
      <rect x="3" y="3" width="16" height="18" rx="1.5" {...S} /><rect x="25" y="3" width="16" height="18" rx="1.5" {...S} />
      <path d="M22 2 V22" stroke="var(--danger)" strokeWidth="1" />
      <path d="M6 8 H15 M6 11 H13 M6 14 H16" {...F} />
      <path d="M28 8 H37 M28 14 H36" stroke="var(--success)" strokeWidth="1.2" strokeLinecap="round" /><path d="M28 11 H35" stroke="var(--danger)" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  // A list beside a detail pane, the top row flagged, a dock of dots.
  inbox: (
    <>
      <rect x="4" y="4" width="32" height="16" rx="1.5" {...S} /><path d="M15 4 V20" {...H} />
      <path d="M7 8 H12" {...A} /><path d="M7 12 H12 M7 16 H11 M18 8 H31 M18 12 H28" {...F} />
      <circle cx="39.5" cy="7" r="1.2" fill={ACCENT} /><circle cx="39.5" cy="11" r="1.2" fill={SOFT} /><circle cx="39.5" cy="15" r="1.2" fill={FAINT} />
    </>
  ),
  // The API Bar as first sketched: one door (the note comes in), one bar of five APIs.
  apiBar: (
    <>
      <path d="M22 2 V7 M19.5 4.5 L22 7 L24.5 4.5" {...A} />
      <rect x="3" y="9" width="38" height="12" rx="3" {...S} />
      <path d="M6 12 H11 V18 H6 Z M13 12 H18 V18 H13 Z M20 12 H25 V18 H20 Z M27 12 H32 V18 H27 Z M34 12 H39 V18 H34 Z" {...F} />
      <rect x="20" y="12" width="5" height="6" fill={ACCENT} />
    </>
  ),
  // Agents finding each other across a network.
  registry: (
    <>
      <path d="M9 7 L22 12 L35 6 M22 12 L14 18 M22 12 L32 18 M9 7 L14 18" {...F} />
      <circle cx="9" cy="7" r="2" fill={SOFT} /><circle cx="35" cy="6" r="2" fill={SOFT} />
      <circle cx="14" cy="18" r="2" fill={SOFT} /><circle cx="32" cy="18" r="2" fill={SOFT} />
      <circle cx="22" cy="12" r="3" {...A} /><circle cx="22" cy="12" r="1.2" fill={ACCENT} />
    </>
  ),
  // An eye watching over a run of work.
  overseer: (
    <>
      <path d="M8 10 Q22 1 36 10 Q22 19 8 10 Z" {...S} />
      <circle cx="22" cy="10" r="3" {...S} /><circle cx="22" cy="10" r="1.3" fill={ACCENT} />
      <path d="M9 19 H17 M19 19 H27 M29 19 H35" {...F} />
    </>
  ),
  // One conductor sending work to three agents.
  vex: (
    <>
      <circle cx="10" cy="12" r="3.2" {...A} />
      <path d="M13.5 12 L28 6 M13.5 12 H28 M13.5 12 L28 18" {...F} />
      <rect x="29" y="4" width="8" height="4" rx="1" {...S} /><rect x="29" y="10" width="8" height="4" rx="1" {...S} /><rect x="29" y="16" width="8" height="4" rx="1" {...S} />
    </>
  ),
  // Requests waiting for an OK; one still open.
  policyDashboard: (
    <>
      <rect x="6" y="4" width="32" height="5" rx="1" {...F} /><path d="M9 6.5 L10.3 7.8 L12.5 5.3" {...S} />
      <rect x="6" y="11" width="32" height="5" rx="1" {...F} /><path d="M9 13.5 L10.3 14.8 L12.5 12.3" {...S} />
      <rect x="6" y="18" width="32" height="4" rx="1" {...A} /><circle cx="10.5" cy="20" r="1" fill={ACCENT} />
      <path d="M15 6.5 H28 M15 13.5 H25" {...H} />
    </>
  ),
  // Spans of an agent's run laid out on a timeline.
  agent_trace: (
    <>
      <path d="M5 21 H39" {...H} />
      <path d="M6 5 H36" {...S} strokeWidth="2" />
      <path d="M9 9 H20" {...F} strokeWidth="2" /><path d="M21 13 H33" {...A} strokeWidth="2" />
      <path d="M12 17 H17 M24 17 H30" {...F} strokeWidth="2" />
    </>
  ),
  // A bulb on the anvil, sparks flying.
  ideaFoundry: (
    <>
      <path d="M19 15 Q14 12 14 8 A6 6 0 0 1 26 8 Q26 12 21 15 Z" {...S} />
      <path d="M19 17.5 H21 M18.5 15 V17.5 M21.5 15 V17.5" {...S} />
      <path d="M10 20 H30" {...F} />
      <path d="M30 6 L33 4.5 M31 10 H35 M29.5 13.5 L32.5 15.5" {...A} />
    </>
  ),
};
