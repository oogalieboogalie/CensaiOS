// State and actions for one Censai Slides window. The deck syncs (each
// slide on its own); which slide and box you have selected stay local.
import React from 'react';
import {
  deckMeta, insertSlidePatch, makeSlide, moveSlidePatch, readDeck, removeSlidePatch, slideKey, updateBlock,
} from '../../../lib/office/slideModel.js';
import { newPartId } from '../../../lib/office/officeParts.js';

export function useSlides(win, onUpdate) {
  const deck = React.useMemo(() => readDeck(win), [win]);
  const [currentId, setCurrentId] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);
  const current = deck.order.includes(currentId) ? currentId : deck.order[0] || null;
  const slide = current ? deck.slides[current] : null;
  const block = slide?.blocks.find((b) => b.id === selectedId) || null;

  const putSlide = (id, next) => onUpdate?.({ [slideKey(id)]: next });
  const changeBlock = (id, change) => { if (slide) putSlide(current, updateBlock(slide, id, change)); };
  const addSlide = (layout = 'titleBody') => {
    const { id, patch } = insertSlidePatch(deck, current, makeSlide(layout));
    onUpdate?.(patch);
    setCurrentId(id);
    setSelectedId(null);
  };
  const duplicate = () => {
    if (!slide) return;
    const copy = { ...slide, at: Date.now(), blocks: slide.blocks.map((b) => ({ ...b, id: newPartId('t') })) };
    const { id, patch } = insertSlidePatch(deck, current, copy);
    onUpdate?.(patch);
    setCurrentId(id);
  };
  const removeSlide = (id = current) => {
    if (!id) return;
    const i = deck.order.indexOf(id);
    onUpdate?.(removeSlidePatch(deck, id));
    setCurrentId(deck.order[i + 1] || deck.order[i - 1] || null);
  };
  const move = (id, delta) => {
    const patch = moveSlidePatch(deck, id, delta);
    if (patch) onUpdate?.(patch);
  };
  const addBlock = (fields) => {
    if (!slide) return;
    const id = newPartId('t');
    putSlide(current, { ...slide, blocks: [...slide.blocks, { id, x: 20, y: 30, w: 60, h: 30, ...fields }] });
    setSelectedId(id);
    if (fields.type === 'text') setEditingId(id);
  };
  const removeBlock = (id = selectedId) => {
    if (!slide || !id) return;
    putSlide(current, { ...slide, blocks: slide.blocks.filter((b) => b.id !== id) });
    setSelectedId(null);
  };

  const edit = {
    selectedId,
    editingId,
    onSelect: (id) => { setSelectedId(id); if (id !== editingId) setEditingId(null); },
    onEdit: (id) => { setSelectedId(id); setEditingId(id); },
    onBox: (id, box) => changeBlock(id, { x: box.x, y: box.y, w: box.w, h: box.h }),
    onRemove: (id) => removeBlock(id),
    onText: (id, text) => { changeBlock(id, { text }); setEditingId(null); },
  };

  return {
    deck, current, slide, block, edit, setCurrentId, setSelectedId,
    addSlide, duplicate, removeSlide, move, addBlock, removeBlock, changeBlock,
    setNotes: (notes) => slide && putSlide(current, { ...slide, notes }),
    setTheme: (theme) => onUpdate?.(deckMeta(deck, { theme })),
  };
}
