/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { parseInline } from '../../../lib/office/docModel.js';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';
import { TeammatesHere } from './TeammatesHere.jsx';

const PLACEHOLDER = {
  p: 'Write, or type # for a heading, - for a list', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
  bullet: 'List item', number: 'List item', quote: 'Quote', code: 'Code',
};

export function InlineText({ text }) {
  return parseInline(text).map((run, i) => {
    if (run.link) return <a key={i} href={run.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{run.text}</a>;
    if (run.code) return <code key={i}>{run.text}</code>;
    if (run.bold) return <strong key={i}>{run.text}</strong>;
    if (run.italic) return <em key={i}>{run.text}</em>;
    return <React.Fragment key={i}>{run.text}</React.Fragment>;
  });
}

function fit(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * One text block. While focused it is a plain textarea showing the markdown
 * marks; otherwise it renders them, in the same type, so nothing jumps.
 * With `windowId`, teammates' cursors in this paragraph show with their
 * names: right at the letter while you type in it too, otherwise as a name
 * tag on the paragraph. Your cursor goes out to them. Only a spot goes out,
 * never words.
 */
export function DocTextBlock({ id, block, number, focused, editor, readOnly, windowId }) {
  const ref = React.useRef(null);
  const text = block.text || '';
  // A teammate's words landing in this paragraph keep your caret in place.
  useSharedCaret(ref, text);
  const field = `ob.${id}/text`;
  const live = Boolean(windowId && id);
  const editing = focused && !readOnly;
  useCaretReporter(ref, windowId, field, live && editing);
  const carets = useTeammateCarets(windowId, field, live);
  React.useLayoutEffect(() => {
    if (!focused) return;
    fit(ref.current);
    editor.bindFocused(id, ref.current);
  });
  const marker = block.type === 'bullet' ? '•' : block.type === 'number' ? `${number}.` : null;
  return (
    <div className="hb-of-block" data-type={block.type}>
      {marker && <span className="hb-of-marker" aria-hidden="true">{marker}</span>}
      {editing ? (
        <div className="hb-of-textbox">
          <textarea ref={ref} className="hb-of-text" rows={1} value={text} spellCheck={block.type !== 'code'}
            aria-label={PLACEHOLDER[block.type] || 'Text'} placeholder={PLACEHOLDER[block.type]}
            onChange={(e) => { fit(e.target); editor.setText(id, e.target.value); }}
            onKeyDown={(e) => editor.onKeyDown(e, id)}
            onPaste={(e) => editor.onPaste(e, id)} />
          <TeammateCarets boxRef={ref} carets={carets} text={text} />
        </div>
      ) : (
        <div className="hb-of-text" data-empty={text ? undefined : 'true'} data-placeholder={PLACEHOLDER[block.type]}
          role="textbox" tabIndex={readOnly ? -1 : 0} aria-readonly={readOnly || undefined}
          onFocus={() => !readOnly && editor.focus(id, text.length)}
          onMouseDown={(e) => { if (!readOnly && !e.target.closest('a')) { e.preventDefault(); editor.focus(id, text.length); } }}>
          {block.type === 'code' ? text : <InlineText text={text} />}
        </div>
      )}
      {!editing && <TeammatesHere carets={carets} />}
    </div>
  );
}
