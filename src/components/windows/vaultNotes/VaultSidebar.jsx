import React from 'react';
import { Icon } from '../../Icons.jsx';
import { VAULT_BASES, VAULT_FOLDERS } from './data.js';

export function VaultSidebar({ activeBase, onSelectBase }) {
  return (
    <aside className="hb-vault-sidebar" aria-label="Vault sidebar">
      <div className="hb-vault-sidebar-tools">
        <button type="button" title="New note" aria-label="New note"><Icon.Files size={13} /></button>
        <button type="button" title="New folder" aria-label="New folder"><Icon.Folder size={13} /></button>
        <button type="button" title="Search" aria-label="Search"><Icon.Search size={13} /></button>
      </div>

      <div className="hb-vault-section">
        <div className="hb-vault-section-label">Bases</div>
        <ul className="hb-vault-base-list">
          {VAULT_BASES.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="hb-vault-base"
                data-active={activeBase === name ? 'true' : 'false'}
                onClick={() => onSelectBase?.(name)}
              >
                <span className="hb-vault-base-name">{name}</span>
                <span className="hb-vault-base-kind">BASE</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {VAULT_FOLDERS.map((folder) => (
        <div key={folder} className="hb-vault-section">
          <div className="hb-vault-section-label">{folder}</div>
        </div>
      ))}

      <div className="hb-vault-sidebar-foot">
        <span>Notes</span>
        <span className="hb-vault-sidebar-foot-icons" aria-hidden="true">
          <span className="hb-vault-help">?</span>
          <Icon.Gear size={12} />
        </span>
      </div>
    </aside>
  );
}
