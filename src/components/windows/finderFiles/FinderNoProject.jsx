import React from 'react';
import { Icon } from '../../Icons.jsx';
import { FolderPicker } from '../FolderPicker.jsx';
import { useComputerOwnerAnswer } from '../../docker/useComputerOwner.js';
import { FINDER_WORDS } from './finderFormat.js';

/**
 * "Open a project…": the header's folder picker, so whatever is picked is a
 * folder censaiOS can reach, and is put on the board's open projects. Only
 * this computer's owner opens projects (the server refuses anyone else), so a
 * teammate is told so instead. `inline` opens the picker in place, below the
 * button, so it fits the window however short it is.
 */
export function FinderOpenProject({ onPick, inline = false }) {
  const owner = useComputerOwnerAnswer();
  const [picking, setPicking] = React.useState(false);
  if (owner === null) return null;
  if (!owner) return <span className="hb-finder-open-note">{FINDER_WORDS.ownerOpens}</span>;
  return (
    <span className="hb-finder-open" data-inline={inline ? 'true' : undefined}>
      <button type="button" className="hb-finder-open-button" onClick={() => setPicking(true)}>
        {FINDER_WORDS.openProject}
      </button>
      {picking && (
        <FolderPicker
          className="hb-finder-picker"
          onClose={() => setPicking(false)}
          onPick={(picked) => {
            setPicking(false);
            onPick(picked);
          }}
        />
      )}
    </span>
  );
}

/** A Finder with no project to list: says so and offers to open one. */
export function FinderNoProject({ onPick }) {
  return (
    <div className="hb-finder-none" data-testid="finder-no-project">
      <span className="hb-empty-icon" aria-hidden="true"><Icon.Folder size={20} /></span>
      <p className="hb-finder-none-words">{FINDER_WORDS.noProject}</p>
      <p className="hb-finder-none-hint">{FINDER_WORDS.noProjectHint}</p>
      <FinderOpenProject onPick={onPick} inline />
    </div>
  );
}
