/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';

const GLYPHS = { text: Icon.Files, code: Icon.Code, file: Icon.Files, image: Icon.Picture };

/**
 * A big output as a card in the chat (spec 3). One click opens it as its own
 * window on the canvas, linked back to this chat.
 *
 * actions: [{ label, onClick, primary? }]
 */
export function ArtifactCard({ type = 'text', title, meta, actions = [] }) {
  const Glyph = GLYPHS[type] || Icon.Files;
  return (
    <div className="hb-artifact" data-testid="artifact-card" data-artifact-type={type}>
      <span className="hb-artifact-icon" aria-hidden="true"><Glyph size={15} /></span>
      <span className="hb-artifact-text">
        <span className="hb-artifact-title" title={title}>{title}</span>
        {meta && <span className="hb-artifact-meta">{meta}</span>}
      </span>
      {actions.filter(Boolean).map(a => (
        <button key={a.label} type="button" className="hb-text-btn" data-primary={a.primary ? 'true' : undefined}
          onClick={a.onClick} disabled={a.disabled} title={a.title || a.label}>
          {a.primary && <Icon.OpenWindow size={12} />}{a.label}
        </button>
      ))}
    </div>
  );
}
