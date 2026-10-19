import React from 'react';
import { BrandMark } from '../brand/BrandMark.jsx';

const STATE_WORDS = {
  idle: 'here',
  working: 'working on it',
  talking: 'just answered',
};

// Censai's face: the censaiOS Grid mark in a round glass bubble with an
// Ultem ring. `state` (idle | working | talking) is set as
// data-censai-state so later animations hook onto it in CSS alone.
export function CensaiAvatar({ size = 40, state = 'idle', unread = 0 }) {
  return (
    <span
      className="hb-censai-avatar"
      data-censai-state={state}
      style={{ width: size, height: size }}
      title={`Censai · ${STATE_WORDS[state] || STATE_WORDS.idle}`}
    >
      <BrandMark size={Math.round(size * 0.58)} title="" />
      {unread > 0 && <span className="hb-censai-unread" aria-label={`${unread} new`}>{unread > 9 ? '9+' : unread}</span>}
    </span>
  );
}
