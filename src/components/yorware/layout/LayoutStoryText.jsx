/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';
import { storyKey } from '../../../lib/yorware/layoutModel.js';

/** Where a Layout story's words sit in the window's shared fields. */
export const layoutStoryField = (storyId) => (storyId ? `${storyKey(storyId)}/text` : null);

/**
 * The box in the Text panel where a text frame's words are typed. A
 * teammate's letters landing in it keep your cursor where it was. On a board,
 * a teammate typing in the same story shows as a line with their name right
 * at the letter, and your cursor goes out to them. Only a spot goes out, never words.
 */
export function LayoutStoryBox({ textRef, windowId, storyId, text = '', onText }) {
  const field = layoutStoryField(storyId);
  const live = Boolean(windowId && field);
  useSharedCaret(textRef, text);
  useCaretReporter(textRef, windowId, field, live);
  const carets = useTeammateCarets(windowId, field, live);
  return (
    <div className="hb-yl-story-box">
      <textarea ref={textRef} className="hb-cr-input hb-cr-textarea hb-yl-story" aria-label="Text" value={text}
        placeholder="Type here. Text that doesn't fit flows into the next linked frame." onChange={(e) => onText(e.target.value)} />
      <TeammateCarets boxRef={textRef} carets={carets} text={text} />
    </div>
  );
}

/**
 * On the page: each teammate typing in this frame's story gets a small name
 * tag in their colour above the frame's top right corner. `u` is one screen
 * pixel in page points. Shown on the first frame of a story on the page.
 */
export function LayoutStoryHere({ windowId, frame: f, u = 1 }) {
  const field = layoutStoryField(f?.story);
  const carets = useTeammateCarets(windowId, field, Boolean(windowId && field));
  if (!carets.length) return null;
  const h = 16 * u;
  let right = f.x + f.w;
  return (
    <g className="hb-yl-here" aria-label={`${carets.map((c) => c.name).join(', ')} typing here`}>
      {carets.map((c) => {
        const w = (c.name.length * 6.4 + 12) * u;
        right -= w;
        const x = right;
        right -= 4 * u;
        return (
          <g key={c.clientId} data-teammate-caret={c.name} data-at={c.index} style={{ '--caret-color': c.color }}>
            <rect x={x} y={f.y - h - 2 * u} width={w} height={h} rx={3 * u} className="hb-yl-here-tag" />
            <text x={x + w / 2} y={f.y - 2 * u - 4.5 * u} fontSize={11 * u} textAnchor="middle" className="hb-yl-here-name">{c.name}</text>
          </g>
        );
      })}
    </g>
  );
}
