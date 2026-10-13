import React from 'react';

// Reactions are drawn as line icons, not emoji (restrained look).
export const REACTION_LABELS = Object.freeze({
  like: 'Like',
  love: 'Love it',
  clap: 'Applause',
  question: 'Question',
});

export function ReactionIcon({ reaction, size = 16 }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  };
  if (reaction === 'love') {
    return <svg {...common}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>;
  }
  if (reaction === 'clap') {
    return <svg {...common}><path d="M8 13l-2.5-2.5a1.4 1.4 0 0 1 2-2L11 12" /><path d="M9 9.5L7.5 8a1.4 1.4 0 0 1 2-2l5 5" /><path d="M12 7l-.5-.5a1.4 1.4 0 0 1 2-2l4 4a6 6 0 0 1-8.5 8.5L6 14" /><path d="M17 3.5l.5-1.5M20 6l1.5-.5" /></svg>;
  }
  if (reaction === 'question') {
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2-2.3 3.5" /><path d="M12 17h.01" /></svg>;
  }
  if (reaction === 'hand') {
    return <svg {...common}><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5" /><path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 18.5L3.5 15a1.5 1.5 0 0 1 2.6-1.5L8 16" /></svg>;
  }
  return <svg {...common}><path d="M7 11v9H4v-9h3z" /><path d="M7 11l4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7" /></svg>;
}
