// Editing behaviour for Censai Docs: which block has the caret, Enter to
// split, Backspace to merge, arrows between blocks, markdown shortcuts and
// Ctrl+B / Ctrl+I. Every change is a small window patch (one block, or a
// block plus the order), so teammates editing other blocks never collide.
import React from 'react';
import {
  TEXT_TYPES, blockKey, insertBlocksPatch, makeBlock, readDoc, removeBlockPatch,
} from '../../../lib/office/docModel.js';
import { markdownToBlocks } from '../../../lib/office/docMarkdown.js';

const SHORTCUTS = [
  [/^#\s/, 'h1'], [/^##\s/, 'h2'], [/^###\s/, 'h3'], [/^[-*]\s/, 'bullet'], [/^1[.)]\s/, 'number'], [/^>\s/, 'quote'], [/^```$/, 'code'],
];
const CONTINUES = new Set(['bullet', 'number']);

export function useDocEditor(win, onUpdate) {
  const doc = React.useMemo(() => readDoc(win), [win]);
  const docRef = React.useRef(doc);
  docRef.current = doc;
  const [focusedId, setFocusedId] = React.useState(null);
  const pending = React.useRef(null); // { id, pos } caret to place after render
  const focusedEl = React.useRef(null);

  const patchBlock = (id, change) => {
    const block = docRef.current.blocks[id];
    if (block) onUpdate?.({ [blockKey(id)]: { ...block, ...change } });
  };
  const focus = (id, pos = 0) => { pending.current = { id, pos }; setFocusedId(id); };
  const textIds = () => docRef.current.order.filter((id) => TEXT_TYPES.includes(docRef.current.blocks[id]?.type));

  const insertAfter = (afterId, blocks, caret = 0) => {
    const { patch, ids } = insertBlocksPatch(docRef.current.order, afterId, blocks);
    onUpdate?.(patch);
    const firstText = ids.find((_, i) => TEXT_TYPES.includes(blocks[i].type));
    if (firstText) focus(firstText, caret);
    return ids;
  };

  const setText = (id, value) => {
    const block = docRef.current.blocks[id];
    if (!block) return;
    if (block.type === 'p') {
      for (const [re, type] of SHORTCUTS) {
        if (re.test(value)) {
          patchBlock(id, { type, text: value.replace(re, '') });
          focus(id, 0);
          return;
        }
      }
      if (/^(---|\*\*\*)$/.test(value)) {
        patchBlock(id, { type: 'divider', text: '' });
        insertAfter(id, [makeBlock('p')]);
        return;
      }
    }
    patchBlock(id, { text: value });
  };

  const wrap = (marker) => {
    const el = focusedEl.current;
    const id = focusedId;
    if (!el || !id) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const inner = value.slice(s, e) || 'text';
    patchBlock(id, { text: value.slice(0, s) + marker + inner + marker + value.slice(e) });
    pending.current = { id, pos: s + marker.length, end: s + marker.length + inner.length };
    setFocusedId(id);
  };

  const onKeyDown = (e, id) => {
    const el = e.currentTarget;
    const block = docRef.current.blocks[id];
    const { selectionStart: s, selectionEnd: end, value } = el;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); wrap(e.key === 'b' ? '**' : '*'); return; }
    if (e.key === 'Enter' && !e.shiftKey && (block.type !== 'code' || mod)) {
      e.preventDefault();
      if (CONTINUES.has(block.type) && !value.trim()) { patchBlock(id, { type: 'p', text: '' }); focus(id, 0); return; }
      const nextType = CONTINUES.has(block.type) ? block.type : 'p';
      patchBlock(id, { text: value.slice(0, s) });
      insertAfter(id, [makeBlock(nextType, { text: value.slice(end) })]);
      return;
    }
    const ids = textIds();
    const at = ids.indexOf(id);
    if (e.key === 'Backspace' && s === 0 && end === 0) {
      if (block.type !== 'p') { e.preventDefault(); patchBlock(id, { type: 'p' }); return; }
      const prevId = ids[at - 1];
      if (!prevId) return;
      e.preventDefault();
      const prev = docRef.current.blocks[prevId];
      const prevText = prev.text || '';
      onUpdate?.({ ...removeBlockPatch(docRef.current.order, id), [blockKey(prevId)]: { ...prev, text: prevText + value } });
      focus(prevId, prevText.length);
      return;
    }
    if (e.key === 'ArrowUp' && s === 0 && at > 0) { e.preventDefault(); focus(ids[at - 1], docRef.current.blocks[ids[at - 1]].text?.length || 0); }
    if (e.key === 'ArrowDown' && s === value.length && at < ids.length - 1) { e.preventDefault(); focus(ids[at + 1], 0); }
    if (e.key === 'Escape') { el.blur(); setFocusedId(null); }
  };

  // Pasting several lines of markdown makes real blocks.
  const onPaste = (e, id) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\n')) return;
    const blocks = markdownToBlocks(text);
    if (blocks.length < 2) return;
    e.preventDefault();
    insertAfter(id, blocks.map((b) => makeBlock(b.type, b)));
  };

  const bindFocused = (id, el) => {
    focusedEl.current = el;
    if (pending.current?.id !== id || !el) return;
    const { pos, end } = pending.current;
    pending.current = null;
    el.focus();
    el.setSelectionRange(pos, end ?? pos);
  };

  return {
    doc, focusedId, setFocusedId, focus, insertAfter, patchBlock, setText, wrap, onKeyDown, onPaste, bindFocused,
    remove: (id) => onUpdate?.(removeBlockPatch(docRef.current.order, id)),
  };
}
