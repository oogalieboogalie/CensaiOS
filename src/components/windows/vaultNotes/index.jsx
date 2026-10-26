import React from 'react';
import { WindowTitle } from '../../Windows.jsx';
import { Icon } from '../../Icons.jsx';
import { VaultSidebar } from './VaultSidebar.jsx';
import { VaultEditor } from './VaultEditor.jsx';
import {
  DEFAULT_NOTE_PATH,
  DEFAULT_NOTE_TEXT,
  DEFAULT_NOTE_TITLE,
} from './data.js';

export function VaultNotesWindow({ win = {}, onUpdate }) {
  const title = win.title || win.fileName || DEFAULT_NOTE_TITLE;
  const text = typeof win.text === 'string' ? win.text : DEFAULT_NOTE_TEXT;
  const pathParts = Array.isArray(win.pathParts) && win.pathParts.length
    ? win.pathParts
    : DEFAULT_NOTE_PATH;
  const [activeBase, setActiveBase] = React.useState(win.activeBase || 'Recipes');

  return (
    <>
      <WindowTitle
        icon={<Icon.Files size={14} />}
        label={title}
        subtitle="vault"
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}
      />
      <div className="hb-vault" data-testid="vault-notes">
        <VaultSidebar
          activeBase={activeBase}
          onSelectBase={(name) => {
            setActiveBase(name);
            onUpdate?.({ activeBase: name });
          }}
        />
        <VaultEditor
          title={title}
          pathParts={pathParts}
          text={text}
          onChangeText={(next) => onUpdate?.({ text: next })}
        />
      </div>
    </>
  );
}

export default VaultNotesWindow;
