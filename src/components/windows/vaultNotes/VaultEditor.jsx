import React from 'react';
import { Icon } from '../../Icons.jsx';
import { noteStats } from './data.js';

export function VaultEditor({
  title,
  pathParts,
  text,
  onChangeText,
}) {
  const stats = noteStats(text);
  return (
    <section className="hb-vault-main" aria-label="Note editor">
      <div className="hb-vault-tabs">
        <div className="hb-vault-tab" data-active="true">
          <span className="hb-vault-tab-label">{title}</span>
          <span className="hb-vault-tab-x" aria-hidden="true">×</span>
        </div>
        <button type="button" className="hb-vault-tab-add" aria-label="New tab">+</button>
      </div>

      <div className="hb-vault-crumbs">
        <div className="hb-vault-nav">
          <button type="button" aria-label="Back">‹</button>
          <button type="button" aria-label="Forward">›</button>
        </div>
        <nav className="hb-vault-path" aria-label="Breadcrumb">
          {pathParts.map((part, i) => (
            <React.Fragment key={`${part}-${i}`}>
              {i > 0 && <span className="hb-vault-path-sep">/</span>}
              <span data-current={i === pathParts.length - 1 ? 'true' : 'false'}>{part}</span>
            </React.Fragment>
          ))}
        </nav>
        <div className="hb-vault-crumb-actions">
          <button type="button" title="Edit" aria-label="Edit"><Icon.Edit size={13} /></button>
          <button type="button" title="More" aria-label="More">···</button>
        </div>
      </div>

      <textarea
        className="hb-vault-editor"
        value={text}
        onChange={(e) => onChangeText?.(e.target.value)}
        spellCheck={false}
        aria-label={title}
      />

      <footer className="hb-vault-status">
        <span>{stats.backlinks} backlinks</span>
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.characters.toLocaleString()} characters</span>
        <span className="hb-vault-status-ok" title="Saved" aria-label="Saved">✓</span>
      </footer>
    </section>
  );
}
