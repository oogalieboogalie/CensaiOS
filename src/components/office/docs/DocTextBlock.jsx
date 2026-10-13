/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { parseInline } from '../../../lib/office/docModel.js';

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
 */
export function DocTextBlock({ id, block, number, focused, editor, readOnly }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!focused) return;
    fit(ref.current);
    editor.bindFocused(id, ref.current);
  });
  const marker = block.type === 'bullet' ? '•' : block.type === 'number' ? `${number}.` : null;
  const text = block.text || '';
  return (
    <div className="hb-of-block" data-type={block.type}>
      {marker && <span className="hb-of-marker" aria-hidden="true">{marker}</span>}
      {focused && !readOnly ? (
        <textarea ref={ref} className="hb-of-text" rows={1} value={text} spellCheck={block.type !== 'code'}
          aria-label={PLACEHOLDER[block.type] || 'Text'} placeholder={PLACEHOLDER[block.type]}
          onChange={(e) => { fit(e.target); editor.setText(id, e.target.value); }}
          onKeyDown={(e) => editor.onKeyDown(e, id)}
          onPaste={(e) => editor.onPaste(e, id)} />
      ) : (
        <div className="hb-of-text" data-empty={text ? undefined : 'true'} data-placeholder={PLACEHOLDER[block.type]}
          role="textbox" tabIndex={readOnly ? -1 : 0} aria-readonly={readOnly || undefined}
          onFocus={() => !readOnly && editor.focus(id, text.length)}
          onMouseDown={(e) => { if (!readOnly && !e.target.closest('a')) { e.preventDefault(); editor.focus(id, text.length); } }}>
          {block.type === 'code' ? text : <InlineText text={text} />}
        </div>
      )}
    </div>
  );
}
