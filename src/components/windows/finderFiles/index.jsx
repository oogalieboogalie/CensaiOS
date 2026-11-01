import React from 'react';
import { WindowTitle } from '../../Windows.jsx';
import { Icon } from '../../Icons.jsx';
import { FinderSidebar } from './FinderSidebar.jsx';
import { FinderList } from './FinderList.jsx';
import { DEFAULT_FINDER_FILES } from './data.js';

export function FinderFilesWindow({ win = {}, onUpdate }) {
  const folderName = win.folderName || win.title || 'Downloads';
  const files = Array.isArray(win.files) && win.files.length ? win.files : DEFAULT_FINDER_FILES;
  const [selectedNav, setSelectedNav] = React.useState(win.selectedNav || 'downloads');
  const [selectedId, setSelectedId] = React.useState(win.selectedFileId || files[0]?.id || null);

  return (
    <>
      <WindowTitle
        icon={<Icon.Folder size={14} />}
        label={folderName}
        subtitle="finder"
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}
      />
      <div className="hb-finder" data-testid="finder-files">
        <FinderSidebar
          selectedNav={selectedNav}
          onSelectNav={(id) => {
            setSelectedNav(id);
            onUpdate?.({ selectedNav: id });
          }}
        />
        <FinderList
          folderName={folderName}
          files={files}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            onUpdate?.({ selectedFileId: id });
          }}
        />
      </div>
    </>
  );
}

export default FinderFilesWindow;
