/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { Prompter } from '../../teleprompter/Prompter.jsx';
import { normalizePrompter, PROMPTER_KEY, readingTime, readShared, writeShared } from '../../../lib/teleprompter/prompterState.js';
import { openPrompterPopOut, POP_OUT_NOTES } from '../../../lib/teleprompter/popOut.js';
import { windowMeta } from './meta.js';

export { windowMeta };

const same = (a, b) => a.text === b.text && a.speed === b.speed && a.size === b.size && a.mirror === b.mirror;

/**
 * Teleprompter window. The script and settings are saved on the window and
 * mirrored to the pop-out, so editing here updates the pop-out live and the
 * pop-out's speed and size buttons update this window.
 */
export function TeleprompterWindow({ win = {}, onUpdate }) {
  const state = normalizePrompter(win);
  const [mode, setMode] = React.useState('read');
  const [note, setNote] = React.useState('');
  const latest = React.useRef(state);
  latest.current = state;

  const change = React.useCallback((patch) => {
    const next = normalizePrompter({ ...latest.current, ...patch });
    writeShared(next);
    onUpdate?.(patch);
  }, [onUpdate]);

  // Keep the pop-out in step with this window, and take its changes back.
  React.useEffect(() => { writeShared(latest.current); }, []);
  React.useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== PROMPTER_KEY) return;
      const next = readShared();
      if (!same(next, latest.current)) onUpdate?.(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [onUpdate]);

  const popOut = async () => {
    writeShared(latest.current);
    const how = await openPrompterPopOut();
    setNote(POP_OUT_NOTES[how] || '');
  };

  const time = readingTime(state.text);
  const actions = [
    { id: 'mode', label: mode === 'read' ? 'Edit script' : 'Read', icon: <Icon.Edit size={12} />, onSelect: () => setMode(mode === 'read' ? 'edit' : 'read') },
    { id: 'popout', label: 'Pop out on top', icon: <Icon.OpenWindow size={12} />, onSelect: popOut, title: 'Open the reader in a small window that stays on top, right under your camera' },
  ];

  return (
    <>
      <WindowTitle icon={<Icon.Video size={12} />} label={win.title || windowMeta.label} subtitle={`${time.words} words, about ${time.label}`} actions={actions} />
      <div className="hb-teleprompter">
        {note && <p className="hb-teleprompter-note" role="status">{note}</p>}
        {mode === 'edit' ? (
          <div className="hb-teleprompter-edit">
            <textarea className="hb-teleprompter-input" value={state.text} aria-label="Script"
              placeholder="Paste or type what you want to say. Leave a blank line between parts."
              onChange={(e) => change({ text: e.target.value })} />
            <div className="hb-teleprompter-row">
              <span className="hb-teleprompter-hint">{time.words} words, about {time.label} at a calm pace.</span>
              <button type="button" className="hb-btn" onClick={() => setMode('read')}><Icon.Play size={12} /> Read it</button>
            </div>
          </div>
        ) : (
          <Prompter state={state} onChange={change} />
        )}
      </div>
    </>
  );
}

export default TeleprompterWindow;
