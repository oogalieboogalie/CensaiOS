/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../collaboration/TeammateCarets.jsx';
import { layerKey } from '../../lib/creative/photoModel.js';
import { clipKey } from '../../lib/creative/videoModel.js';

/** Where a Photo layer's words (`text` or `name`) sit in the window's shared fields. */
export const photoLayerField = (layerId, key) => (layerId ? `${layerKey(layerId)}/${key}` : null);
/** Where a Video title's words sit in the window's shared fields. */
export const videoTitleField = (clipId) => (clipId ? `${clipKey(clipId)}/text` : null);

/**
 * A box of shared words in a Censai Photo or Video panel (`field` says
 * which). A teammate's letters landing in it keep your cursor where it was.
 * On a board, a teammate typing in the same words shows as a line with their
 * name right at the letter, and your cursor goes out to them. Each layer or
 * title is its own words, so a cursor in one never shows in another. Only a
 * spot goes out, never words. `oneLine` makes a one-line box (a name).
 */
export function CreativeCaretText({ windowId, field, value = '', onType, label, oneLine = false }) {
  const ref = React.useRef(null);
  const live = Boolean(windowId && field);
  useSharedCaret(ref, value);
  useCaretReporter(ref, windowId, field, live);
  const carets = useTeammateCarets(windowId, field, live);
  const box = oneLine
    ? <input ref={ref} className="hb-cr-input" aria-label={label} value={value} onChange={(e) => onType(e.target.value)} />
    : <textarea ref={ref} className="hb-cr-input hb-cr-textarea" aria-label={label} value={value} onChange={(e) => onType(e.target.value)} />;
  return (
    <div className="hb-cr-textbox">
      {box}
      <TeammateCarets boxRef={ref} carets={carets} text={value} />
    </div>
  );
}
