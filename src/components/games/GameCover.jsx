/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Cover art for the Add palette's Games section (spec 11): small vector
// pictures drawn in the board's own ink and accent, so they suit every look.
export const GAME_COVERS = {
  asteroids: (
    <>
      <path d="M8 6 L13 4 L17 7 L16 12 L11 13 L7 10 Z" fill="none" stroke="var(--ink-soft)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M33 15 L36 14 L38 17 L36 19 L33 18 Z" fill="none" stroke="var(--ink-soft)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M38 4 L40 3.5 L41 5 L39.5 6 Z" fill="none" stroke="var(--ink-faint)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M22 20 L26 11 L30 20 L26 18 Z" fill="none" stroke="var(--accent-line)" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="26" cy="7" r="0.9" fill="var(--accent)" />
      <circle cx="26" cy="3.5" r="0.9" fill="var(--accent)" />
    </>
  ),
  // A hand-drawn loop with a car on it.
  racetrack: (
    <>
      <path d="M10 12 C10 6 16 4.5 22 5 C30 5.5 35 6 35 11 C35 15 30 14 27 16 C24 18.5 20 19.5 15 19 C11 18.5 10 16 10 12 Z" fill="none" stroke="var(--ink-faint)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 3.5 L22 6.5" stroke="var(--ink)" strokeWidth="1" />
      <rect x="27.5" y="13.2" width="5" height="2.6" rx="0.8" fill="var(--accent)" transform="rotate(-25 30 14.5)" />
    </>
  ),
  // The Grid mark filling in: a company growing dot by dot.
  agentCompany: (
    <>
      {[0, 1, 2, 3, 4, 5, 6].map((c) => [0, 1, 2].map((r) => (
        <circle key={`${c}-${r}`} cx={10 + c * 4} cy={7 + r * 5} r={c < 3 ? 1.3 : 1}
          fill={c < 3 ? 'var(--accent)' : (c + r) % 3 === 0 ? 'var(--ink-faint)' : 'var(--ink-soft)'} />
      )))}
      <circle cx="37" cy="12" r="3.2" fill="none" stroke="var(--accent-line)" strokeWidth="1.1" />
    </>
  ),
  // A few lines of code steering a robot to a goal.
  codeRobot: (
    <>
      <path d="M7 7 H17 M9 11 H19 M9 15 H15 M7 19 H11" stroke="var(--ink-faint)" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="25" y="9" width="7" height="7" rx="1.5" fill="var(--ink)" />
      <rect x="35" y="9" width="5" height="7" rx="1" fill="none" stroke="var(--accent-line)" strokeWidth="1.1" />
    </>
  ),
  // Four lanes running into the distance, notes on the way down.
  rhythmRun: (
    <>
      <path d="M18 3 L26 3 L36 21 L8 21 Z" fill="none" stroke="var(--ink-faint)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M20 3 L15 21 M22 3 L22 21 M24 3 L29 21" stroke="var(--hairline)" strokeWidth="0.8" />
      <ellipse cx="18.5" cy="9" rx="1.6" ry="1" fill="var(--success)" />
      <ellipse cx="25" cy="13" rx="2" ry="1.2" fill="var(--warning)" />
      <ellipse cx="13.5" cy="18" rx="2.4" ry="1.4" fill="var(--accent)" />
    </>
  ),
  // An island with a pine and a fishing ripple.
  driftholm: (
    <>
      <path d="M6 17 C9 13.5 14 12.5 20 12.8 C27 13 33 14 37 17 Z" fill="var(--ink-faint)" />
      <path d="M15 13 L18 5.5 L21 13 Z M16 9.8 L18 4 L20 9.8 Z" fill="var(--ink-soft)" />
      <path d="M17.6 13 L18.4 13 L18.4 14.2 L17.6 14.2 Z" fill="var(--ink-soft)" />
      <rect x="25.5" y="11.2" width="3.2" height="2" rx="0.4" fill="var(--accent)" />
      <ellipse cx="40" cy="19.5" rx="2.6" ry="0.9" fill="none" stroke="var(--accent-line)" strokeWidth="0.9" />
      <path d="M3 20.5 H12 M30 21 H36" stroke="var(--hairline)" strokeWidth="0.8" strokeLinecap="round" />
    </>
  ),
  // A cube, a ball and a play mark: games from any engine.
  gamePlayground: (
    <>
      <path d="M9 9 L14 6.5 L19 9 L19 15 L14 17.5 L9 15 Z" fill="none" stroke="var(--ink-soft)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M9 9 L14 11.5 L19 9 M14 11.5 L14 17.5" fill="none" stroke="var(--ink-faint)" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="25" cy="14" r="3" fill="none" stroke="var(--ink-soft)" strokeWidth="1" />
      <path d="M31 8 L37 12 L31 16 Z" fill="none" stroke="var(--accent-line)" strokeWidth="1.2" strokeLinejoin="round" />
    </>
  ),
};

export function hasGameCover(kind) {
  return Boolean(GAME_COVERS[kind]);
}

export function GameCover({ kind, width = 44, height = 24 }) {
  const art = GAME_COVERS[kind];
  if (!art) return null;
  return (
    <svg className="hb-game-cover" width={width} height={height} viewBox="0 0 44 24" role="img" aria-label={`${kind} cover`}>
      <rect x="0.5" y="0.5" width="43" height="23" rx="3" fill="var(--surface-sunken)" stroke="var(--hairline)" />
      {art}
    </svg>
  );
}
