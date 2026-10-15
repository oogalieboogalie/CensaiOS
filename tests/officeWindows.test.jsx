/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OfficeSheetsWindow } from '../src/components/windows/officeSheets/index.jsx';
import { OfficeDocsWindow } from '../src/components/windows/officeDocs/index.jsx';
import { OfficeSlidesWindow } from '../src/components/windows/officeSlides/index.jsx';
import { OFFICE_STARTERS } from '../src/lib/office/officeStarters.js';
import { readDoc } from '../src/lib/office/docModel.js';
import { readDeck } from '../src/lib/office/slideModel.js';

let latest;
function Harness({ Window, initial }) {
  const [win, setWin] = React.useState({ id: 'w1', ...initial });
  latest = win;
  return <Window win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

afterEach(cleanup);

describe('Censai Sheets window', () => {
  test('typing a formula into a cell shows the result and syncs only that cell', () => {
    render(<Harness Window={OfficeSheetsWindow} initial={OFFICE_STARTERS.officeSheets} />);
    const body = screen.getByLabelText('Sheet1 cells');
    body.focus();
    fireEvent.keyDown(body, { key: '4' });
    fireEvent.keyDown(screen.getByLabelText('Edit A1'), { key: 'Enter' });
    fireEvent.keyDown(body, { key: '=' });
    const input = screen.getByLabelText('Edit A2');
    fireEvent.change(input, { target: { value: '=A1*10' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(latest['oc.s1.A2']).toEqual({ v: '=A1*10' });
    expect(document.querySelector('[data-addr="A2"]').textContent).toBe('40');
    fireEvent.keyDown(body, { key: 'ArrowUp' });
    fireEvent.keyDown(body, { key: 'ArrowUp' });
    fireEvent.keyDown(body, { key: 'b', ctrlKey: true });
    expect(latest['oc.s1.A1']).toEqual({ v: '4', s: { b: true } });
  });

  test('sheets can be added and the export menu lists Excel and CSV', () => {
    render(<Harness Window={OfficeSheetsWindow} initial={OFFICE_STARTERS.officeSheets} />);
    fireEvent.click(screen.getByLabelText('Add a sheet'));
    expect(latest.officeBook.sheets.map((s) => s.name)).toEqual(['Sheet1', 'Sheet2']);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('.xlsx'), expect.stringContaining('.csv'),
    ]);
  });
});

describe('Censai Docs window', () => {
  test('markdown shortcuts and Enter build real blocks', () => {
    render(<Harness Window={OfficeDocsWindow} initial={OFFICE_STARTERS.officeDocs} />);
    fireEvent.mouseDown(screen.getByRole('textbox', { name: '' }));
    let area = document.querySelector('textarea.hb-of-text');
    fireEvent.change(area, { target: { value: '# ' } });
    area = document.querySelector('textarea.hb-of-text');
    fireEvent.change(area, { target: { value: 'Launch plan' } });
    area.setSelectionRange(11, 11);
    fireEvent.keyDown(area, { key: 'Enter' });
    const doc = readDoc(latest);
    expect(doc.order.map((id) => [doc.blocks[id].type, doc.blocks[id].text])).toEqual([['h1', 'Launch plan'], ['p', '']]);
    fireEvent.click(screen.getByRole('button', { name: 'Insert a table' }));
    expect(Object.values(readDoc(latest).blocks).some((b) => b.type === 'table')).toBe(true);
  });
});

describe('YorWare Writer pages', () => {
  test('new documents start on Letter pages; A4 and no pages are one pick away; words are counted', () => {
    render(<Harness Window={OfficeDocsWindow} initial={OFFICE_STARTERS.officeDocs} />);
    const pick = screen.getByLabelText('Page size');
    expect(pick.value).toBe('letter');
    expect(document.querySelector('.yw-paper')).toBeTruthy();
    expect(screen.getByText('1 page')).toBeTruthy();
    fireEvent.change(pick, { target: { value: 'a4' } });
    expect(latest.docPage).toBe('a4');
    fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Offer letter' } });
    expect(screen.getByText('2 words')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: 'none' } });
    expect(latest.docPage).toBeNull();
    expect(document.querySelector('.yw-paper')).toBeNull();
    expect(screen.queryByText('1 page')).toBeNull();
  });
});

describe('Censai Slides window', () => {
  test('adds slides and presents full screen with Escape to leave', async () => {
    render(<Harness Window={OfficeSlidesWindow} initial={OFFICE_STARTERS.officeSlides} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a slide' }));
    expect(readDeck(latest).order).toHaveLength(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Present' })); });
    const dialog = screen.getByRole('dialog', { name: 'Presenting' });
    expect(screen.getByText('2 / 2')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('a picture on a slide can be deleted with the Delete key, the toolbar or its little x', () => {
    const pic = (id) => ({ id, type: 'image', x: 30, y: 20, w: 40, h: 30, src: 'data:image/png;base64,AA==', alt: id });
    const deck = readDeck({ id: 'w1', ...OFFICE_STARTERS.officeSlides });
    const first = deck.order[0];
    const slide = deck.slides[first];
    render(<Harness Window={OfficeSlidesWindow} initial={{ ...OFFICE_STARTERS.officeSlides, [`os.${first}`]: { ...slide, blocks: [...slide.blocks, pic('p1'), pic('p2'), pic('p3')] } }} />);
    const pics = () => readDeck(latest).slides[first].blocks.filter((b) => b.type === 'image').map((b) => b.id);
    const stage = screen.getByRole('group', { name: 'Slide editor' });
    const box = (alt) => screen.getAllByAltText(alt).find((img) => stage.contains(img)).parentElement;

    fireEvent.pointerDown(box('p1'));
    fireEvent.pointerUp(window);
    fireEvent.keyDown(document.activeElement, { key: 'Delete' });
    expect(pics()).toEqual(['p2', 'p3']);

    fireEvent.pointerDown(box('p2'));
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole('button', { name: /Delete the selected/ }));
    expect(pics()).toEqual(['p3']);

    fireEvent.pointerDown(box('p3'));
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole('button', { name: 'Delete this picture' }));
    expect(pics()).toEqual([]);
  });
});
