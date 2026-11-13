/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Toolbar } from '../src/app/Toolbar.jsx';
import { DockAbove, DockButtons, claimedTools, penOptionTools } from '../src/app/toolbar/extras/moreTools.jsx';
import { claimKeyboard } from '../src/lib/keyboardClaim.js';
import { notePress } from '../src/lib/pasteOwner.js';

function buttons(activeTool, selectTool = jest.fn()) {
  const renderToolButton = (tool, _opts, onClick) => (
    <button
      key={tool.id}
      type="button"
      data-tool={tool.id}
      data-active={tool.id === activeTool ? 'yes' : 'no'}
      title={`${tool.label} (${tool.key})`}
      onClick={onClick || (() => selectTool(tool.id))}
    >
      {tool.label}
    </button>
  );
  const view = render(
    <>
      <DockAbove activeTool={activeTool} renderToolButton={renderToolButton} />
      <DockButtons activeTool={activeTool} renderToolButton={renderToolButton} />
    </>,
  );
  return { ...view, selectTool };
}

test('shapes and the highlighter leave the main row', () => {
  expect(claimedTools).toEqual(['rect', 'ellipse', 'line', 'arrow', 'highlight']);
  expect(penOptionTools).toEqual(['ellipse', 'line', 'arrow', 'highlight']);
});

test('the shape row opens only while a shape is the tool in hand', () => {
  const { unmount } = buttons('select');
  expect(screen.queryByTestId('dock-shapes')).not.toBeInTheDocument();
  expect(screen.getByTitle('Rectangle (R)')).toHaveAttribute('data-active', 'no');
  unmount();

  buttons('ellipse');
  const row = screen.getByTestId('dock-shapes');
  expect(row).toHaveTextContent('Rectangle');
  expect(row).toHaveTextContent('Ellipse');
  expect(row).toHaveTextContent('Line');
  expect(row).toHaveTextContent('Arrow');
  const chosen = screen.getAllByTitle('Ellipse (O)').find((el) => el.getAttribute('data-active') === 'yes');
  expect(chosen).toBeTruthy();
});

test('picking a shape from the row selects it', () => {
  const { selectTool } = buttons('rect');
  fireEvent.click(screen.getByTitle('Line (K)'));
  expect(selectTool).toHaveBeenCalledWith('line');
});

test('highlight keeps its own button and key', () => {
  const { selectTool } = buttons('select');
  fireEvent.click(screen.getByTitle('Highlight (M)'));
  expect(selectTool).toHaveBeenCalledWith('highlight');
});

test('image, undo and redo do not change the tool in hand', () => {
  const seen = [];
  window.addEventListener('canvas:history', (e) => seen.push(e.detail.action));
  const { selectTool } = buttons('select');
  fireEvent.click(screen.getByTitle('Undo (Z)'));
  fireEvent.click(screen.getByTitle('Redo (Y)'));
  fireEvent.click(screen.getByTitle('Image (I)'));
  expect(seen).toEqual(['undo', 'redo']);
  expect(selectTool).not.toHaveBeenCalled();
  expect(screen.getByTestId('dock-image-file')).toHaveAttribute('accept', 'image/*');
});

test('Z, Y and I are the undo, redo and image keys, and they stay clear of typing', () => {
  const seen = [];
  window.addEventListener('canvas:history', (e) => seen.push(e.detail.action));
  buttons('select');
  const file = screen.getByTestId('dock-image-file');
  const click = jest.spyOn(file, 'click').mockImplementation(() => {});

  fireEvent.keyDown(window, { key: 'z' });
  fireEvent.keyDown(window, { key: 'y' });
  fireEvent.keyDown(window, { key: 'i' });
  expect(seen).toEqual(['undo', 'redo']);
  expect(click).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'y', metaKey: true });
  expect(seen).toEqual(['undo', 'redo']);

  const release = claimKeyboard('game');
  fireEvent.keyDown(window, { key: 'z' });
  release();
  expect(seen).toEqual(['undo', 'redo']);

  render(<input aria-label="typing-box" />);
  fireEvent.keyDown(screen.getByLabelText('typing-box'), { key: 'z' });
  expect(seen).toEqual(['undo', 'redo']);
});

test('ellipse, line, arrow and highlight answer their keys on the board', () => {
  const onSelectTool = jest.fn();
  render(
    <Toolbar
      activeTool="select"
      onSelectTool={onSelectTool}
      penColor="var(--ink)"
      setPenColor={jest.fn()}
      penSize={4}
      setPenSize={jest.fn()}
      focusMode={false}
      onAiAgent={jest.fn()}
    />,
  );
  for (const key of ['o', 'k', 'w', 'm']) fireEvent.keyDown(document, { key });
  expect(onSelectTool.mock.calls.map((call) => call[0])).toEqual(['ellipse', 'line', 'arrow', 'highlight']);
});

test('board keys stay quiet while a window has the focus or the last press', () => {
  const seen = [];
  const onHistory = (e) => seen.push(e.detail.action);
  window.addEventListener('canvas:history', onHistory);
  const onSelectTool = jest.fn();
  const frame = document.createElement('div');
  frame.setAttribute('data-win-id', 'photo-1');
  const inner = document.createElement('div');
  inner.tabIndex = 0;
  frame.appendChild(inner);
  document.body.appendChild(frame);
  try {
    render(
      <Toolbar
        activeTool="select"
        onSelectTool={onSelectTool}
        penColor="var(--ink)"
        setPenColor={jest.fn()}
        penSize={4}
        setPenSize={jest.fn()}
        focusMode={false}
        onAiAgent={jest.fn()}
      />,
    );
    buttons('select');
    const file = screen.getByTestId('dock-image-file');
    const click = jest.spyOn(file, 'click').mockImplementation(() => {});

    inner.focus();
    fireEvent.keyDown(inner, { key: 'i' });
    fireEvent.keyDown(inner, { key: 'z' });
    fireEvent.keyDown(inner, { key: 'm' });
    fireEvent.keyDown(inner, { key: 'o' });
    expect(click).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    expect(onSelectTool).not.toHaveBeenCalled();

    inner.blur();
    notePress({ target: inner });
    fireEvent.keyDown(document.body, { key: 'i' });
    fireEvent.keyDown(document.body, { key: 'o' });
    expect(click).not.toHaveBeenCalled();
    expect(onSelectTool).not.toHaveBeenCalled();

    notePress({ target: document.body });
    fireEvent.keyDown(document.body, { key: 'i' });
    fireEvent.keyDown(document.body, { key: 'o' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledWith('ellipse');
  } finally {
    window.removeEventListener('canvas:history', onHistory);
    notePress({ target: document.body });
    frame.remove();
  }
});
