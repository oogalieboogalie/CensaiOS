/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CreativePhotoWindow } from '../src/components/windows/creativePhoto/index.jsx';
import { CreativeVectorWindow } from '../src/components/windows/creativeVector/index.jsx';
import { CreativeVideoWindow } from '../src/components/windows/creativeVideo/index.jsx';
import { CREATIVE_STARTERS } from '../src/lib/creative/creativeStarters.js';
import { readPhoto } from '../src/lib/creative/photoModel.js';
import { readVector } from '../src/lib/creative/vectorModel.js';
import { readVideo } from '../src/lib/creative/videoModel.js';

// jsdom has no PointerEvent; a MouseEvent carries the same coordinates.
if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  };
}

let latest;
function Harness({ Window, initial }) {
  const [win, setWin] = React.useState({ id: 'w1', ...initial });
  latest = win;
  return <Window win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

afterEach(cleanup);

describe('Censai Photo window', () => {
  test('layers, filters and undo', async () => {
    await act(async () => { render(<Harness Window={CreativePhotoWindow} initial={CREATIVE_STARTERS.creativePhoto} />); });
    fireEvent.click(screen.getByRole('button', { name: 'New layer' }));
    expect(readPhoto(latest).order).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Mono' }));
    const top = readPhoto(latest);
    expect(top.layers[top.order[1]].adj).toEqual({ grayscale: 100, contrast: 10 });
    fireEvent.keyDown(document.querySelector('.hb-cr'), { key: 'z', ctrlKey: true });
    const back = readPhoto(latest);
    expect(back.layers[back.order[1]].adj).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('.png'), expect.stringContaining('.jpg'), expect.stringContaining('.webp'),
    ]);
  });
});

describe('Censai Vector window', () => {
  test('a shape drawn with the tools can be aligned, grouped and exported', async () => {
    const seeded = { ...CREATIVE_STARTERS.creativeVector };
    render(<Harness Window={CreativeVectorWindow} initial={seeded} />);
    const svg = screen.getByRole('img', { name: 'Artboard' });
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 });
    fireEvent.keyDown(document.querySelector('.hb-cr'), { key: 'r' });
    fireEvent.pointerDown(svg, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 200 });
    let doc = readVector(latest);
    expect(doc.order).toHaveLength(1);
    const rect = doc.shapes[doc.order[0]];
    expect(rect.type).toBe('rect');
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    doc = readVector(latest);
    expect(doc.shapes[doc.order[0]].x + doc.shapes[doc.order[0]].w).toBe(1200);
    fireEvent.keyDown(document.querySelector('.hb-cr'), { key: 'd', ctrlKey: true });
    fireEvent.keyDown(document.querySelector('.hb-cr'), { key: 'a', ctrlKey: true });
    fireEvent.keyDown(document.querySelector('.hb-cr'), { key: 'g', ctrlKey: true });
    doc = readVector(latest);
    expect(doc.order).toHaveLength(2);
    expect(new Set(doc.order.map((id) => doc.shapes[id].group)).size).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([expect.stringContaining('.svg'), expect.stringContaining('.png')]);
  });
});

describe('Censai Video window', () => {
  test('titles go on the timeline and split at the playhead', () => {
    render(<Harness Window={CreativeVideoWindow} initial={CREATIVE_STARTERS.creativeVideo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a title at the playhead (T)' }));
    let doc = readVideo(latest);
    expect(doc.ids).toHaveLength(1);
    expect(doc.clips[doc.ids[0]]).toMatchObject({ track: 't', start: 0, dur: 3, text: 'Title' });
    fireEvent.change(screen.getByLabelText('Title text'), { target: { value: 'Day one' } });
    expect(readVideo(latest).clips[doc.ids[0]].text).toBe('Day one');
    // No MediaRecorder in this test browser: only the still frame is offered.
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([expect.stringContaining('Still frame')]);
    fireEvent.keyDown(document.querySelector('.hb-cr'), { key: 'Delete' });
    doc = readVideo(latest);
    expect(doc.ids).toHaveLength(0);
  });
});
