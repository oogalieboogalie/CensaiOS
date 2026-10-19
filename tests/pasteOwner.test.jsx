/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { act, render, cleanup } from '@testing-library/react';
import { notePress, pasteOwner, pasteOwnerLine } from '../src/lib/pasteOwner.js';
import { claimKeyboard, releaseKeyboard } from '../src/lib/keyboardClaim.js';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';
import { useAppKeyboard } from '../src/app/hooks/useAppKeyboard.js';

// A paste belongs to the canvas only when the board itself is where the
// person is. A paste in a window (a Sheets cell, a chat box, an editor), or
// right after a click on one, or while one holds the keyboard, stays with that
// window: the canvas must not pop up a "Pasted Note" window on top of it.

function frame({ id = 'w1', kind = 'officeSheets', active = false } = {}) {
  const el = document.createElement('div');
  el.setAttribute('data-win-id', id);
  el.setAttribute('data-win-kind', kind);
  el.setAttribute('data-win-frame', '');
  el.setAttribute('data-active', active ? 'true' : 'false');
  document.body.appendChild(el);
  return el;
}

function focusable(parent) {
  const el = document.createElement('div');
  el.tabIndex = 0;
  parent.appendChild(el);
  return el;
}

function pasteEvent(text = 'Apples\t12\nPears\t4') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  return event;
}

const on = (target, defaultPrevented = false) => ({ target, defaultPrevented });
const pressOn = (target) => notePress({ target });

afterEach(() => {
  cleanup();
  releaseKeyboard();
  document.activeElement?.blur?.();
  document.body.innerHTML = '';
  pressOn(document.body);
});

describe('pasteOwner', () => {
  test('a paste on the empty board is the canvas’s', () => {
    expect(pasteOwner(on(document.body))).toBeNull();
  });

  test('a paste inside a window is that window’s, even on a plain focusable div', () => {
    const cells = focusable(frame());
    expect(pasteOwner(on(cells))).toEqual({ why: 'inside-window', kind: 'officeSheets', id: 'w1' });
  });

  test('a paste a window already handled is left alone', () => {
    const cells = focusable(frame());
    expect(pasteOwner(on(cells, true))).toEqual({ why: 'handled', kind: 'officeSheets', id: 'w1' });
    expect(pasteOwner(on(document.body, true)).why).toBe('handled');
  });

  test('the window with the focus owns a paste the browser aimed at a selection elsewhere', () => {
    const cells = focusable(frame());
    cells.focus();
    const stale = document.createElement('p'); // a word double-clicked earlier, outside any window
    document.body.appendChild(stale);
    expect(pasteOwner(on(stale))).toEqual({ why: 'inside-window', kind: 'officeSheets', id: 'w1' });
  });

  test('a window that redrew under the paste still owns it, found from the focused element', () => {
    const editor = focusable(frame({ id: 'c1', kind: 'code_editor' }));
    editor.focus();
    const gone = document.createElement('br'); // the line the editor replaced while pasting
    expect(gone.isConnected).toBe(false);
    expect(pasteOwner(on(gone, true))).toEqual({ why: 'handled', kind: 'code_editor', id: 'c1' });
    expect(pasteOwner(on(gone))).toEqual({ why: 'inside-window', kind: 'code_editor', id: 'c1' });
  });

  test('text boxes and editors keep their pastes, inside a window or not', () => {
    const box = document.createElement('textarea');
    document.body.appendChild(box);
    expect(pasteOwner(on(box))).toEqual({ why: 'typing', kind: '', id: '' });

    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const line = document.createElement('p');
    editor.appendChild(line);
    frame({ id: 'd1', kind: 'officeDocs' }).appendChild(editor);
    expect(pasteOwner(on(line))).toEqual({ why: 'typing', kind: 'officeDocs', id: 'd1' });
  });

  test('a window holding the keyboard owns every paste, and the log names that window', () => {
    frame({ id: 'chat-1', kind: 'chat' });
    const target = focusable(frame({ id: 'chat-2', kind: 'chat' }));
    frame({ id: 'game-1', kind: 'asteroids' });
    frame({ id: 'm1', kind: 'music' });
    claimKeyboard('game-1');
    expect(pasteOwner(on(target))).toEqual({ why: 'keyboard', kind: 'asteroids', id: 'game-1' });
    claimKeyboard('music:m1');
    expect(pasteOwner(on(document.body))).toEqual({ why: 'keyboard', kind: 'music', id: 'music:m1' });
    claimKeyboard('studio');
    expect(pasteOwner(on(document.body))).toEqual({ why: 'keyboard', kind: '', id: 'studio' });
  });

  test('the window clicked last owns a paste that landed on the page body, until it closes or the board is clicked', () => {
    const win = frame();
    const header = document.createElement('div');
    win.appendChild(header);
    pressOn(header);
    expect(pasteOwner(on(document.body))).toEqual({ why: 'pressed-window', kind: 'officeSheets', id: 'w1' });
    pressOn(document.body);
    expect(pasteOwner(on(document.body))).toBeNull();
    pressOn(header);
    win.remove();
    expect(pasteOwner(on(document.body))).toBeNull();
  });

  test('the selected (active) window alone does not block the board: new windows start active', () => {
    frame({ id: 'note-1', kind: 'doc', active: true });
    expect(pasteOwner(on(document.body))).toBeNull();
  });

  test('log lines name the owner and never carry the pasted text', () => {
    expect(pasteOwnerLine({ why: 'inside-window', kind: 'officeSheets', id: 'w1' }))
      .toBe('canvas-paste: left a paste alone, the officeSheets window is where the paste landed');
    expect(pasteOwnerLine({ why: 'typing', kind: '', id: '' })).toBe('canvas-paste: left a paste alone, the cursor is in a text box');
    expect(pasteOwnerLine({ why: 'keyboard', kind: '', id: 'studio' })).toBe('canvas-paste: left a paste alone, "studio" holds the keyboard');
    expect(pasteOwnerLine({ why: 'pressed-window', kind: 'officeSheets', id: 'w1' }))
      .toBe('canvas-paste: left a paste alone, the officeSheets window was clicked last (click an empty spot on the board to paste there)');
  });
});

describe('the canvas paste handler', () => {
  const noop = () => {};

  function Board({ spawnAt, sheetPastes }) {
    useAppKeyboard({ onNewAgent: noop, onNewWindow: noop, redo: noop, undo: noop, setFocusMode: noop, spawnAt });
    return (
      <>
        <div data-testid="board" />
        <div data-win-id="sheet-1" data-win-kind="officeSheets" data-win-frame data-active="true">
          <div data-testid="header" />
          <div data-testid="cells" tabIndex={0}
            onPaste={(e) => { e.preventDefault(); sheetPastes.push(e.clipboardData.getData('text/plain')); }} />
        </div>
      </>
    );
  }

  const press = (el) => act(() => { el.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
  const paste = (el, text) => {
    const event = pasteEvent(text);
    act(() => { el.dispatchEvent(event); });
    return event;
  };

  test('pasting into Sheets fills the sheet and pops up nothing on the canvas', () => {
    const spawnAt = jest.fn();
    const sheetPastes = [];
    const { getByTestId } = render(<Board spawnAt={spawnAt} sheetPastes={sheetPastes} />);
    press(getByTestId('cells'));
    paste(getByTestId('cells'), 'Apples\t12');
    expect(sheetPastes).toEqual(['Apples\t12']);
    expect(spawnAt).not.toHaveBeenCalled();
    const line = pendingAppLog().find((e) => e.where === 'canvas-paste');
    expect(line).toMatchObject({ level: 'info', message: 'canvas-paste: left a paste alone, the officeSheets window took the paste itself' });
    expect(line.message).not.toContain('Apples');
  });

  test('pasting right after a click on the Sheets header pops up nothing either', () => {
    const spawnAt = jest.fn();
    const { getByTestId } = render(<Board spawnAt={spawnAt} sheetPastes={[]} />);
    press(getByTestId('header'));
    paste(document.body, 'Call the caterer on Friday');
    expect(spawnAt).not.toHaveBeenCalled();
  });

  test('after a click on the empty board, every paste makes a note window, two in a row too', () => {
    const spawnAt = jest.fn();
    const { getByTestId } = render(<Board spawnAt={spawnAt} sheetPastes={[]} />);
    press(getByTestId('header'));
    press(getByTestId('board'));
    expect(paste(document.body, 'Call the caterer').defaultPrevented).toBe(true);
    paste(document.body, 'Order pizza');
    expect(spawnAt.mock.calls).toEqual([
      ['doc', { fileName: 'Pasted Note.md', text: 'Call the caterer' }],
      ['doc', { fileName: 'Pasted Note.md', text: 'Order pizza' }],
    ]);
  });
});
