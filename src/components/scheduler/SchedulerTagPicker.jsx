import React from 'react';
import { SCHEDULE_TAGS, cleanTag, tagHue } from '../../lib/schedule/tags.js';

/** A colored label for the run, from the usual few or your own word. */
export function SchedulerTagPicker({ tag, setTag }) {
  const isPreset = SCHEDULE_TAGS.some((t) => t.id === tag);
  const [custom, setCustom] = React.useState(tag && !isPreset ? tag : '');

  return (
    <div className="hb-sched-field">
      <span className="hb-sched-label">Tag</span>
      <div className="hb-sched-chips">
        {SCHEDULE_TAGS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="hb-sched-chip hb-sched-tagchip"
            style={{ '--tag-hue': t.hue }}
            aria-pressed={tag === t.id}
            onClick={() => { setTag(tag === t.id ? '' : t.id); setCustom(''); }}
          >
            {t.id}
          </button>
        ))}
      </div>
      <input
        className="hb-sched-input"
        type="text"
        maxLength={32}
        placeholder="Or your own tag"
        aria-label="Your own tag"
        value={custom}
        onChange={(e) => { setCustom(e.target.value); setTag(cleanTag(e.target.value)); }}
      />
    </div>
  );
}

/** The small colored tag on a run's card. */
export function SchedulerTag({ tag }) {
  const clean = cleanTag(tag);
  if (!clean) return null;
  return <span className="hb-sched-tag" style={{ '--tag-hue': tagHue(clean) }}>{clean}</span>;
}
