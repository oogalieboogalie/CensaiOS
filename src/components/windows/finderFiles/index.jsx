import React from 'react';
import { WindowTitle } from '../../Windows.jsx';
import { Icon } from '../../Icons.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { revealWindow } from '../../../lib/showWindow.js';
import { projectPatch } from '../../../lib/windowProject.js';
import { openFileWindow } from '../../files/fileRouting.js';
import { FinderSidebar } from './FinderSidebar.jsx';
import { FinderList } from './FinderList.jsx';
import { FinderNoProject, FinderOpenProject } from './FinderNoProject.jsx';
import { finderCrumbs, folderNameOf } from './finderFormat.js';
import { useFinderFolder } from './useFinderFolder.js';

// The Finder: the files of this window's project (the board's default
// project, unless another was picked in its header), Finder-style. A
// double-click opens a folder, or a file in its window the same way Files
// does.

function FinderBrowser({ project, onSpawn, onSelect, onPick, isActive, title }) {
  const finder = useFinderFolder(project.path, isActive);
  const onUpdateWindow = useWorkspaceStore((s) => s.onUpdate);
  const [selected, setSelected] = React.useState(null);
  const crumbs = finderCrumbs(project.path, finder.folder, project.name, finder.shownRoot);
  const here = crumbs[crumbs.length - 1].name;
  const open = (item) => {
    if (item.isDir) finder.go(item.path);
    // The board's own list: a window's `wins` prop holds only where windows are.
    else openFileWindow(item, { wins: useWorkspaceStore.getState().wins, onSelect, onShow: revealWindow, onSpawn, onUpdateWindow });
  };
  // A project that is gone, not open on the board, or out of censaiOS's
  // sight (in Docker) can be swapped for another.
  const stuck = crumbs.length === 1 && ['missing', 'outside', 'unseen'].includes(finder.problem?.reason);

  return (
    <>
      {title(here)}
      <div className="hb-finder" data-testid="finder-files">
        <FinderSidebar project={project} folders={finder.topFolders} folder={finder.folder} onGo={finder.go} />
        <FinderList
          title={here}
          items={finder.items}
          problem={finder.problem}
          offer={stuck ? <FinderOpenProject onPick={onPick} /> : null}
          selected={selected}
          onSelectItem={setSelected}
          onOpen={open}
          nav={finder}
          crumbs={crumbs}
          onGo={finder.go}
        />
      </div>
    </>
  );
}

export function FinderFilesWindow({ win = {}, onUpdate, onSpawn, currentProject, onSelect, isActive }) {
  const path = currentProject?.path || '';
  // Every pick starts the list afresh, even of the same folder (opened again
  // after it dropped off the board's open projects).
  const [picks, setPicks] = React.useState(0);
  const pick = (picked) => {
    setPicks((n) => n + 1);
    onUpdate?.(projectPatch(win, picked));
  };
  const title = (subtitle) => (
    <WindowTitle
      icon={<Icon.Folder size={14} />}
      label="Finder"
      subtitle={subtitle}
      attachedAgentIds={win.attachedAgents}
      onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}
    />
  );

  if (path) {
    const project = { path, name: currentProject.name || folderNameOf(path) };
    // Keyed by the project: another project starts at its own top folder.
    return (
      <FinderBrowser key={`${path}#${picks}`} project={project} onSpawn={onSpawn} onSelect={onSelect}
        onPick={pick} isActive={isActive} title={title} />
    );
  }
  return (
    <>
      {title('No project')}
      <div className="hb-finder" data-testid="finder-files" data-alone="true">
        <FinderNoProject onPick={pick} />
      </div>
    </>
  );
}

export default FinderFilesWindow;
