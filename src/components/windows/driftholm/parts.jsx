/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ITEMS, PACK_SLOTS, STYLES, levelProgress } from '../../../lib/games/driftholm/save.js';

/** Small drawings of what you carry: a log end-on, a fish, a cut of meat or a hide. */
export function ItemIcon({ id, size = 26 }) {
  const item = ITEMS[id];
  if (!item) return null;
  if (item.kind === 'log') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
        <g transform="rotate(-28 14 14)">
          <rect x="4" y="9.5" width="18" height="9" rx="4.5" fill={item.bark} />
          <ellipse cx="21" cy="14" rx="3.6" ry="4.5" fill={item.grain} />
          <ellipse cx="21" cy="14" rx="1.6" ry="2.1" fill="none" stroke={item.bark} strokeWidth="0.8" opacity="0.6" />
        </g>
      </svg>
    );
  }
  if (item.kind === 'meat') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
        <path d="M6 15 C5 9 12 6 18 8 C24 10 24 17 19 20 C14 23 7 21 6 15 Z" fill={item.flesh} />
        <path d="M18 8 C24 10 24 17 19 20" fill="none" stroke={item.fat} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 13 C12 11 15 11 16 13" fill="none" stroke={item.fat} strokeWidth="1" opacity="0.55" strokeLinecap="round" />
      </svg>
    );
  }
  if (item.kind === 'hide') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
        <path d="M5 8 L9 6 L14 8 L19 6 L23 8 L22 14 L24 20 L19 22 L14 20 L9 22 L4 20 L6 14 Z" fill={item.hide} />
        <ellipse cx="11" cy="12" rx="3" ry="2.4" fill={item.spot} />
        <ellipse cx="17.5" cy="17" rx="2.4" ry="1.8" fill={item.spot} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <g transform="rotate(-20 14 14)">
        <path d="M4.5 14 C8 8.5 16 8 20.5 14 C16 20 8 19.5 4.5 14 Z" fill={item.body} />
        <path d="M7 15.5 C10 17.5 15 17.5 18.5 15.2 C15 18.8 9.5 18.8 7 15.5 Z" fill={item.belly} />
        <path d="M20 14 L25 10 L24 14 L25 18 Z" fill={item.body} />
        <circle cx="8" cy="13.2" r="0.9" fill={item.belly} />
      </g>
    </svg>
  );
}

/** Every skill as a small tile: its level, and a bar toward the next. */
export function Skills({ skills }) {
  return (
    <section className="hb-drift-section" aria-label="Skills">
      <div className="hb-drift-head">Skills</div>
      <div className="hb-drift-skills">
        {skills.map((line) => (
          <div key={line.skill} className="hb-drift-skill" data-testid={`drift-skill-${line.skill}`}
            title={`${line.xp.toLocaleString()} xp${line.level < 99 ? ` · ${(line.next_level - line.xp).toLocaleString()} to level ${line.level + 1}` : ''}`}>
            <div className="hb-drift-skill-row">
              <span>{line.name}</span>
              <span className="hb-drift-level" data-testid={`drift-level-${line.skill}`}>{line.level}</span>
            </div>
            <div className="hb-drift-bar"><span style={{ width: `${Math.round(levelProgress(line) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Your health, the cow you're fighting, and which skill your blows train. */
export function Fighting({ hud, command }) {
  const share = hud.max_hp ? hud.hp / hud.max_hp : 0;
  return (
    <section className="hb-drift-section" aria-label="Health and fighting">
      <div className="hb-drift-head">Health <span className="hb-drift-muted">Combat level {hud.combat}</span></div>
      <div className="hb-drift-hp" data-testid="drift-hp">
        <div className="hb-drift-hp-bar" data-low={share <= 0.3 ? 'true' : undefined}><span style={{ width: `${Math.round(share * 100)}%` }} /></div>
        <span className="hb-drift-hp-num">{hud.hp} / {hud.max_hp}</span>
      </div>
      {hud.foe && <div className="hb-drift-muted" data-testid="drift-foe">Cow {hud.foe[0]} / {hud.foe[1]}</div>}
      <div className="hb-drift-styles" role="radiogroup" aria-label="What your blows train">
        {STYLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={hud.style === s.id} data-on={hud.style === s.id ? 'true' : undefined}
            data-testid={`drift-style-${s.id}`} title={`Your blows train ${s.trains}`} onClick={() => command('style', { style: s.id })}>
            {s.trains}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Pack({ pack, onDrop, onEat }) {
  const [picked, setPicked] = React.useState(null);
  React.useEffect(() => { if (picked !== null && picked >= pack.length) setPicked(null); }, [pack.length, picked]);
  const slots = Array.from({ length: PACK_SLOTS }, (_, i) => pack[i] || null);
  const item = picked !== null ? ITEMS[pack[picked]] : null;
  return (
    <section className="hb-drift-section" aria-label="Pack">
      <div className="hb-drift-head">Pack <span className="hb-drift-muted">{pack.length} / {PACK_SLOTS}</span></div>
      <div className="hb-drift-pack" data-testid="drift-pack">
        {slots.map((id, i) => (
          <button key={i} type="button" className="hb-drift-slot" disabled={!id} data-picked={picked === i ? 'true' : undefined}
            title={id ? ITEMS[id]?.name : undefined} aria-label={id ? ITEMS[id]?.name : 'Empty slot'} onClick={() => setPicked(picked === i ? null : i)}>
            {id && <ItemIcon id={id} />}
          </button>
        ))}
      </div>
      {item && (
        <div className="hb-drift-picked">
          <span>{item.name}</span>
          <span className="hb-drift-picked-actions">
            {item.heals && <button type="button" className="hb-btn" data-primary="true" data-testid="drift-eat" onClick={() => { onEat(picked); setPicked(null); }}>Eat</button>}
            <button type="button" className="hb-btn" onClick={() => { onDrop(picked); setPicked(null); }}>Drop</button>
          </span>
        </div>
      )}
    </section>
  );
}
