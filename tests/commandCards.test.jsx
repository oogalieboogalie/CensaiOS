/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { brandFor } from '../src/lib/brands/index.js';
import {
  createCommandLog, dropSessionLog, noteReplay, noteWorkbench, recordInput, recordOutput, resetSessionLog, sessionLog, sessionReplayed,
} from '../src/components/terminal/commandLog.js';
import { changesOutsideThisComputer, presentCommands } from '../src/components/terminal/commandCards.js';
import { CommandCards } from '../src/components/terminal/CommandCards.jsx';
import { mountCommandCards, shouldShowCards } from '../src/components/terminal/mountCommandCards.jsx';

afterEach(() => {
  cleanup();
  resetSessionLog();
  document.body.replaceChildren();
});

function finish(log, command, output, at = 1_000) {
  log.input(`${command}\r`, at);
  log.output(`${command}\n${output}\n$ `, at + 4000);
}

test('a finished check becomes one card, and a push is outside this computer', () => {
  const log = createCommandLog();
  finish(log, 'npm test', '27 passed, 0 failed');
  finish(log, 'npm run dev', 'Error: listen EADDRINUSE :::3000', 10_000);
  finish(log, 'git push', 'Everything up-to-date', 20_000);
  log.input('npm start\r', 30_000);
  log.output('npm start\n', 30_100);

  const cards = presentCommands(log.list(), 31_000);
  expect(cards.map((card) => card.title)).toEqual([
    'Starting the app',
    'Sent the changes up',
    'Tried to start the app',
    'Ran the checks',
  ]);
  expect(cards[3].sentence).toBe('27 passed, 0 failed.');
  expect(cards[3].status).toBe('ok');
  expect(cards[3].took).toBe('4 s');
  expect(cards[3].who).toBe('You');
  expect(cards[3].you).toBe(true);
  expect(cards[2].sentence).toBe('It did not start. Something else is already using that port.');
  expect(cards[2].status).toBe('bad');
  expect(cards[1].outside).toBe(true);
  expect(cards[0].status).toBe('run');
  expect(cards[0].took).toBe('still going');

  expect(changesOutsideThisComputer('git pull')).toBe(false);
  expect(changesOutsideThisComputer('npm publish')).toBe(true);
  expect(changesOutsideThisComputer('npm run deploy')).toBe(true);

  const sent = [];
  const live = sessionLog('again');
  live.setRun((command) => sent.push(command));
  expect(live.run('npm test')).toBe(true);
  expect(sent).toEqual(['npm test']);
  live.output('npm test\n');
  expect(live.list()).toHaveLength(1);
  live.setRun(null);
  expect(live.run('npm test')).toBe(false);
  expect(live.list()).toHaveLength(1);
});

test('output, passwords, and arrow keys do not become commands', () => {
  const log = createCommandLog();
  log.input('\x1b[A\x1b[Bls\r', 1);
  log.output('ls\n', 1);
  expect(log.list()[0].command).toBe('ls');
  log.output('[sudo] password for user: ', 2);
  log.input('hunter2\r', 3);
  log.output('Password: ', 4);
  log.input('secret\r', 5);
  expect(log.list().map((item) => item.command)).toEqual(['ls']);

  log.output('Paste your authentication token:', 6);
  log.input('ghp_secret', 7);
  log.output('ghp_secret', 7);
  log.input('\r', 8);
  log.output('API key: ', 9);
  log.input('sk-live\r', 10);
  log.output('\nEnter PIN: ', 11);
  log.input('1234\r', 12);
  log.output('\nOTP: ', 13);
  log.input('999111\r', 14);
  log.output('\nName: ', 15);
  log.input('hidden-name\r', 16);
  log.output('\n$ ', 17);
  expect(log.list().some((item) => /ghp_|sk-live|1234|999111|hidden-name|hunter2/.test(item.command))).toBe(false);
  log.input('pwd', 18);
  log.output('pwd', 18);
  log.input('\r', 19);
  expect(log.list().some((item) => item.command === 'pwd')).toBe(true);

  log.output('⤷ Claude ▸ rm -rf /\n', 20);
  expect(log.list().some((item) => /rm/.test(item.command))).toBe(false);
  log.output(`⤷ ${log.nonce} Claude ▸ npm test\n27 passed, 0 failed\n$ `, 21);
  const card = presentCommands(log.list()).find((item) => item.who === 'Claude');
  expect(card.command).toBe('npm test');
  expect(card.status).toBe('ok');
  expect(card.mark.path).toBe(brandFor('claude').path);

  const many = createCommandLog();
  for (let i = 0; i < 205; i += 1) {
    many.input(`echo ${i}\r`);
    many.output(`echo ${i}\n`);
  }
  expect(many.list()).toHaveLength(200);
  expect(many.list()[0].command).toBe('echo 5');

  recordInput('plain', 'pwd\r');
  recordOutput('plain', 'pwd\n');
  expect(sessionLog('plain').list()).toHaveLength(0);
  noteWorkbench('plain');
  recordInput('plain', 'pwd\r');
  recordOutput('plain', 'pwd\n');
  expect(sessionLog('plain').list()).toHaveLength(1);
  dropSessionLog('plain');
  expect(sessionLog('plain').list()).toHaveLength(0);
  noteReplay('later');
  expect(sessionReplayed('later')).toBe(true);
});

test('every command is shown before it can run again', () => {
  const onRun = jest.fn();
  render(
    <CommandCards
      onRun={onRun}
      cards={[
        {
          id: 'a', title: 'Ran the checks', command: 'npm test', sentence: '27 passed, 0 failed.',
          status: 'ok', took: '4 s', who: 'You', you: true, mark: null, output: '27 passed, 0 failed',
          outside: false, running: false,
        },
        {
          id: 'b', title: 'Sent the changes up', command: 'git push', sentence: 'This changed things outside this computer.',
          status: 'ok', took: '1 s', who: 'Grok', you: false,
          mark: { key: 'xai', title: 'Grok', path: 'M9 1' },
          output: 'ok', outside: true, running: false,
        },
      ]}
    />,
  );

  const first = screen.getAllByRole('button', { name: 'Show me first' });
  fireEvent.click(first[0]);
  expect(onRun).not.toHaveBeenCalled();
  expect(screen.getByText('Nothing runs until you say so.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Run it' }));
  expect(onRun).toHaveBeenCalledWith('npm test');

  fireEvent.click(screen.getAllByRole('button', { name: 'Show me first' })[1]);
  expect(onRun).toHaveBeenCalledTimes(1);
  expect(screen.getByText('This changes things outside this computer. Nothing runs until you say so.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Run it' }));
  expect(onRun).toHaveBeenLastCalledWith('git push');

  fireEvent.click(screen.getAllByRole('button', { name: 'Show everything it printed' })[0]);
  expect(screen.getByText('27 passed, 0 failed', { selector: 'pre' })).toBeTruthy();
  expect(document.querySelector('[data-brand-monogram]')).toBeNull();
  expect(document.querySelector('[data-mark="you"]')).toBeTruthy();
  expect(document.querySelectorAll('.hb-cmd-go')).toHaveLength(2);

  cleanup();
  render(<CommandCards cards={[]} replayed onRun={onRun} />);
  expect(screen.getByText('Commands from before the reload are not shown.')).toBeTruthy();
});

test('the workbench slot gets the cards and a plain shell does not', async () => {
  expect(shouldShowCards({ terminalView: 'plain', id: 'w' }, 'w')).toBe(false);
  expect(shouldShowCards({ terminalView: 'workbench', id: 'w' }, 'w')).toBe(true);
  expect(shouldShowCards(
    { terminalView: 'workbench', id: 'w', activeTerminalTab: 'other', terminalTabs: [{ id: 'main' }, { id: 'other' }] },
    'w',
  )).toBe(false);

  document.body.innerHTML = '<div data-win-frame><div data-terminal-view="workbench"></div><div id="host"></div></div>';
  const log = sessionLog('w');
  const host = document.getElementById('host');
  let stop;
  act(() => {
    finish(log, 'git status', 'clean');
    stop = mountCommandCards({ host, sessionId: 'w' });
  });
  const slot = document.querySelector('[data-terminal-view="workbench"]');
  expect(slot.querySelector('.hb-cmd')).toBeTruthy();
  expect(screen.getByText('Checked what changed')).toBeTruthy();
  expect(host.classList.contains('hb-cmd-cover')).toBe(false);
  await act(async () => { stop(); });
  expect(slot.querySelector('.hb-cmd-mount')).toBeNull();

  document.body.innerHTML = '<div id="pane"></div>';
  const pane = document.getElementById('pane');
  act(() => { stop = mountCommandCards({ host: pane, sessionId: 'w' }); });
  expect(pane.classList.contains('hb-cmd-cover')).toBe(true);
  expect(document.querySelector('.hb-cmd-mount')).toBeTruthy();
  await act(async () => { stop(); });
  expect(pane.classList.contains('hb-cmd-cover')).toBe(false);
});

test('cards follow the new log after the shell drops it', async () => {
  document.body.innerHTML = '<div data-win-frame><div data-terminal-view="workbench"></div><div id="host"></div></div>';
  const host = document.getElementById('host');
  const first = sessionLog('shell');
  let stop;
  act(() => {
    finish(first, 'ls', 'file');
    stop = mountCommandCards({ host, sessionId: 'shell' });
  });
  expect(screen.getByText('file.')).toBeTruthy();
  act(() => {
    dropSessionLog('shell');
    finish(sessionLog('shell'), 'pwd', '/work');
  });
  expect(screen.queryByText('file.')).toBeNull();
  expect(screen.getByText('/work.')).toBeTruthy();
  await act(async () => { stop(); });
});
