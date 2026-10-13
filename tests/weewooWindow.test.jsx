/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WeeWooWindow } from '../src/components/windows/weewoo/index.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import { PROPS_BY_KIND } from '../src/lib/modules/addPaletteItems.js';
import { runStarted, runTool } from '../src/lib/weewoo/agentRun.js';

let latest;
function Harness({ initial }) {
  const [win, setWin] = React.useState({ id: 'ww1', kind: 'weewoo', ...initial });
  latest = win;
  return <WeeWooWindow win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

const chat = (id, agentId, extra = {}) => ({ id, kind: 'chat', agentId, x: 0, y: 0, w: 400, h: 300, ...extra });

beforeEach(() => {
  const working = runTool(runStarted(null, { prompt: 'write a migration' }), { tool: 'project_write' });
  useWorkspaceStore.setState({
    wins: [chat('w-atlas', 'atlas', { agentRun: working }), chat('w-echo', 'echo'), { id: 'ww1', kind: 'weewoo' }],
  });
});
afterEach(cleanup);

test('the board\'s agents show up as avatars in their departments', async () => {
  await act(async () => { render(<Harness initial={PROPS_BY_KIND.weewoo} />); });
  const rooms = screen.getAllByTestId('ww-room');
  expect(rooms.map((r) => r.dataset.dept)).toEqual(['ops', 'engineering', 'research', 'growth', 'people', 'lobby']);
  const agents = screen.getAllByTestId('ww-agent');
  expect(agents).toHaveLength(2);
  const atlas = agents.find((a) => a.dataset.windowId === 'w-atlas');
  expect(atlas.dataset.status).toBe('working');
  expect(atlas.dataset.mood).toBe('focused');
  expect(screen.getByTestId('ww-working').textContent).toContain('1 working');
});

test('open an agent, build its avatar, and seat it in another department', async () => {
  const onUpdate = jest.fn();
  useWorkspaceStore.setState({ onUpdate });
  await act(async () => { render(<Harness initial={PROPS_BY_KIND.weewoo} />); });
  fireEvent.click(screen.getAllByTestId('ww-agent').find((a) => a.dataset.windowId === 'w-echo'));
  expect(screen.getByTestId('ww-agent-detail').dataset.windowId).toBe('w-echo');
  fireEvent.click(screen.getByTestId('ww-tab-avatar'));
  fireEvent.click(screen.getByTestId('ww-body-owl'));
  fireEvent.click(screen.getByTestId('ww-accessory-crown'));
  fireEvent.click(screen.getByTestId('ww-avatar-save'));
  expect(onUpdate).toHaveBeenCalledWith('w-echo', { avatar: expect.objectContaining({ body: 'owl', accessory: 'crown', by: 'person' }) });
  fireEvent.click(screen.getByTestId('ww-tab-job'));
  fireEvent.change(screen.getByTestId('ww-seat-select'), { target: { value: 'people' } });
  expect(latest['ws.w-echo']).toBe('people');
});

test('departments can be added and renamed', async () => {
  await act(async () => { render(<Harness initial={PROPS_BY_KIND.weewoo} />); });
  fireEvent.click(screen.getByTestId('ww-add-dept'));
  const dept = screen.getByTestId('ww-department');
  const name = within(dept).getByLabelText('Department name');
  fireEvent.change(name, { target: { value: 'Legal' } });
  fireEvent.blur(name);
  const added = Object.entries(latest).find(([k, v]) => k.startsWith('wd.') && v?.name === 'Legal');
  expect(added).toBeTruthy();
});

test('the demo office shows a pretend company, never mixed with real agents', async () => {
  await act(async () => { render(<Harness initial={{ ...PROPS_BY_KIND.weewoo, demo: true }} />); });
  const agents = screen.getAllByTestId('ww-agent');
  expect(agents).toHaveLength(12);
  expect(agents.some((a) => a.dataset.windowId === 'w-atlas')).toBe(false);
  expect(screen.getByText(/Nothing here is real/)).toBeTruthy();
});
