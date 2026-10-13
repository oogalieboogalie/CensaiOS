/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Avatar } from './Avatar.jsx';
import { ACCESSORIES, AVATAR_COLORS, BODIES, BODY_LABELS, EYES, normalizeAvatar } from '../../lib/weewoo/avatarParts.js';

// Build an avatar from parts: body, color, eyes and an accessory. Saved on
// the agent's window, so everyone on the board sees the same one.
export function AvatarBuilder({ agent, onSave, onReset }) {
  const [draft, setDraft] = React.useState(agent.avatar);
  React.useEffect(() => { setDraft(agent.avatar); }, [agent.windowId, agent.avatar]);
  const set = (part) => setDraft((current) => normalizeAvatar({ ...current, ...part }, current));
  const changed = JSON.stringify(draft) !== JSON.stringify(agent.avatar);
  const source = agent.avatarBy === 'agent' ? `${agent.name} picked this avatar itself.`
    : agent.avatarBy === 'person' ? 'A teammate built this avatar.'
      : `A default from ${agent.name}'s role. ${agent.kind === 'chat' || agent.kind === 'agent' ? 'Ask it to "pick your avatar" and it chooses its own.' : ''}`;

  return (
    <div className="ww-builder" data-testid="ww-avatar-builder">
      <div className="ww-builder-preview">
        <Avatar avatar={draft} status="idle" px={9} />
        <div className="ww-faint">{source}</div>
      </div>
      <div className="ww-builder-parts">
        <div className="ww-eyebrow">Body</div>
        <div className="ww-body-grid" role="radiogroup" aria-label="Body">
          {Object.keys(BODIES).map((body) => (
            <button key={body} type="button" role="radio" aria-checked={draft.body === body} className="ww-part" data-testid={`ww-body-${body}`}
              title={BODY_LABELS[body]} onClick={() => set({ body })}>
              <Avatar avatar={{ ...draft, body }} px={2} />
            </button>
          ))}
        </div>
        <div className="ww-eyebrow">Color</div>
        <div className="ww-swatches" role="radiogroup" aria-label="Color">
          {AVATAR_COLORS.map((color) => (
            <button key={color} type="button" role="radio" aria-checked={draft.color === color} aria-label={color} className="ww-swatch"
              style={{ background: color }} onClick={() => set({ color })} />
          ))}
          <input type="color" className="ww-color-input" aria-label="Any color" value={draft.color} onChange={(e) => set({ color: e.target.value })} />
        </div>
        <div className="ww-eyebrow">Eyes</div>
        <div className="ww-chips">
          {Object.entries(EYES).map(([id, label]) => (
            <button key={id} type="button" className="ww-chip" aria-pressed={draft.eyes === id} onClick={() => set({ eyes: id })}>{label}</button>
          ))}
        </div>
        <div className="ww-eyebrow">Accessory</div>
        <div className="ww-chips">
          {Object.entries(ACCESSORIES).map(([id, part]) => (
            <button key={id} type="button" className="ww-chip" data-testid={`ww-accessory-${id}`} aria-pressed={draft.accessory === id} onClick={() => set({ accessory: id })}>{part.label}</button>
          ))}
        </div>
        <div className="ww-row">
          <button type="button" className="ww-btn ww-btn--primary" data-testid="ww-avatar-save" disabled={!changed} onClick={() => onSave({ ...draft, by: 'person' })}>Save avatar</button>
          {agent.avatarBy !== 'default' && <button type="button" className="ww-btn" onClick={onReset}>Use the default</button>}
        </div>
      </div>
    </div>
  );
}
