import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { usePresentStore } from '../../lib/presentStore.js';
import { GROUP_HOTKEY_SLOTS, loadGroupHotkeys } from '../../lib/groupHotkeys.js';
import { PODCAST_PLACEHOLDERS, defaultScenes, areaOnScreen } from '../../lib/presentScenes.js';
import { buildPodcastBoard } from '../../lib/present/podcastBoard.js';

// The scene list for Present mode: which key each scene uses, its name, what
// it shows (the group on its F-key, or a board area picked from the screen)
// and the presenter's notes. Opened from the Present button's menu.

function whatItShows(scene, bindings, canvasGroups) {
  if (scene.area) return 'A board area you picked';
  const group = canvasGroups.find((g) => g.id === bindings[scene.key]);
  return group ? `The group on F${scene.key}: ${group.label || 'Group'}` : `Nothing on F${scene.key} yet (skipped)`;
}

function SceneRow({ scene, index, count, onChange, onMove, onRemove, bindings, canvasGroups, usedKeys }) {
  const captureArea = () => {
    const { pan, zoom } = useWorkspaceStore.getState();
    onChange({ area: areaOnScreen(pan, zoom) });
  };
  return (
    <li className="hb-present-scene" data-testid="present-scene-row">
      <div className="hb-present-row">
        <select
          aria-label="Key for this scene" value={scene.key}
          onChange={(e) => onChange({ key: e.target.value })} className="hb-present-key"
        >
          {GROUP_HOTKEY_SLOTS.map((k) => (
            <option key={k} value={k} disabled={k !== scene.key && usedKeys.has(k)}>F{k}</option>
          ))}
        </select>
        <input
          aria-label="Scene name" className="hb-present-input" value={scene.name}
          placeholder={PODCAST_PLACEHOLDERS[index] || 'Scene name'}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button type="button" className="hb-present-icon" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="hb-present-icon" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
        <button type="button" className="hb-present-icon" title="Remove scene" onClick={onRemove}>×</button>
      </div>
      <div className="hb-present-row hb-present-shows">
        <span>{whatItShows(scene, bindings, canvasGroups)}</span>
        {scene.area
          ? <button type="button" className="hb-present-link" onClick={() => onChange({ area: null })}>Use the F{scene.key} group</button>
          : <button type="button" className="hb-present-link" onClick={captureArea}>Use what's on screen now</button>}
      </div>
      <textarea
        aria-label="Presenter notes" className="hb-present-input hb-present-notes-input" rows={2}
        value={scene.notes} placeholder="Notes only you will see (press N while presenting)"
        onChange={(e) => onChange({ notes: e.target.value })}
      />
    </li>
  );
}

export function SceneEditor() {
  const scenes = usePresentStore((s) => s.scenes);
  const setScenes = usePresentStore((s) => s.setScenes);
  const setEditorOpen = usePresentStore((s) => s.setEditorOpen);
  const start = usePresentStore((s) => s.start);
  const setNotesOpen = usePresentStore((s) => s.setNotesOpen);
  const workspaceId = usePresentStore((s) => s.workspaceId);
  const canvasGroups = useWorkspaceStore((s) => s.canvasGroups);
  const bindings = React.useMemo(() => loadGroupHotkeys(workspaceId), [workspaceId, canvasGroups]);
  const usedKeys = new Set(scenes.map((s) => s.key));

  const update = (i, patch) => setScenes(scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const next = [...scenes];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setScenes(next);
  };
  const add = () => {
    const key = GROUP_HOTKEY_SLOTS.find((k) => !usedKeys.has(k));
    if (key) setScenes([...scenes, { id: `scene-${Date.now()}`, key, name: '', notes: '', area: null }]);
  };

  return (
    <aside className="hb-present-editor" aria-label="Present scenes" data-testid="present-editor">
      <header className="hb-present-row">
        <strong>Scenes</strong>
        <span className="hb-present-hint">One F-key each. Arrows move between them, Esc ends.</span>
        <button type="button" className="hb-present-icon" title="Close" onClick={() => setEditorOpen(false)}>×</button>
      </header>
      <ol className="hb-present-scenes">
        {scenes.map((scene, i) => (
          <SceneRow
            key={scene.id} scene={scene} index={i} count={scenes.length}
            onChange={(patch) => update(i, patch)} onMove={(d) => move(i, d)}
            onRemove={() => setScenes(scenes.filter((_, j) => j !== i))}
            bindings={bindings} canvasGroups={canvasGroups} usedKeys={usedKeys}
          />
        ))}
      </ol>
      <footer className="hb-present-row">
        <button type="button" className="hb-present-btn" data-primary onClick={() => start()}>Present</button>
        <button type="button" className="hb-present-btn" onClick={() => setNotesOpen(true)}>Presenter notes</button>
        <button type="button" className="hb-present-btn" disabled={usedKeys.size >= 9} onClick={add}>Add scene</button>
        <button type="button" className="hb-present-link" onClick={() => setScenes(defaultScenes())}>Reset to the podcast scenes</button>
        <button
          type="button" className="hb-present-link" data-testid="present-build-podcast"
          title="Adds the six podcast scenes as groups to the right of your board and puts them on F1 to F6"
          onClick={() => buildPodcastBoard({ workspaceId, setScenes })}
        >Build the podcast board</button>
      </footer>
    </aside>
  );
}
