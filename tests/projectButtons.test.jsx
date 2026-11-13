/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { commandsFromProject, loadProjectButtons, projectFilePath, typeCommand } from '../src/components/terminal/projectButtons.js';
import { ProjectButtons } from '../src/components/terminal/ProjectButtons.jsx';

afterEach(cleanup);

const pkg = JSON.stringify({
  scripts: {
    dev: 'vite',
    test: 'jest',
    deploy: 'fly deploy',
  },
});

test('buttons use the commands the project itself declares', () => {
  const buttons = commandsFromProject({ 'package.json': pkg });
  expect(buttons.map((button) => [button.label, button.command])).toEqual([
    ['Start the app', 'npm run dev'],
    ['Run the checks', 'npm test'],
    ['Get the latest code', 'git pull'],
    ['Save my changes', 'git commit'],
    ['Install what it needs', 'npm install'],
  ]);
  expect(buttons.find((button) => button.id === 'start').outside).toBe(false);
  expect(buttons.find((button) => button.id === 'save').outside).toBe(false);
  expect(buttons.find((button) => button.id === 'pull').outside).toBe(false);

  const deployed = commandsFromProject({
    'package.json': JSON.stringify({ scripts: { test: 'fly deploy' } }),
  });
  expect(deployed.find((button) => button.id === 'checks').outside).toBe(true);

  const hooked = commandsFromProject({
    'package.json': JSON.stringify({
      scripts: { dev: 'vite', predev: 'npm run ship', ship: 'fly deploy', preinstall: 'docker push app:1' },
    }),
  });
  expect(hooked.find((button) => button.id === 'start').notice).toBe('fly deploy');
  expect(hooked.find((button) => button.id === 'install').outside).toBe(true);

  const chained = commandsFromProject({
    'package.json': JSON.stringify({ scripts: { test: 'npm run unit', unit: 'fly deploy' } }),
  });
  expect(chained.find((button) => button.id === 'checks').outside).toBe(true);

  const rust = commandsFromProject({ 'Cargo.toml': '[package]\nname = "demo"\n' });
  expect(rust.map((button) => button.command)).toEqual(['cargo test', 'git pull', 'git commit', 'cargo fetch']);

  expect(commandsFromProject({
    'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  }).some((button) => button.id === 'checks')).toBe(false);

  expect(projectFilePath('D:\\Work\\demo', 'package.json')).toBe('D:\\Work\\demo\\package.json');
  expect(projectFilePath('/work/demo/', 'package.json')).toBe('/work/demo/package.json');
});

test('every button shows the command, then waits for Run it', async () => {
  const onRun = jest.fn();
  const buttons = await loadProjectButtons('/work/demo', async (path) => (
    path.endsWith('package.json') ? JSON.stringify({ scripts: { dev: 'vite', test: 'fly deploy' } }) : null
  ));
  render(<ProjectButtons buttons={buttons} onRun={onRun} />);

  fireEvent.click(screen.getByRole('button', { name: /Start the app/ }));
  expect(onRun).not.toHaveBeenCalled();
  expect(screen.getAllByText('npm run dev').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Show me first' }));
  expect(onRun).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Run it' }));
  expect(onRun).toHaveBeenCalledWith('npm run dev');

  fireEvent.click(screen.getByRole('button', { name: /Run the checks/ }));
  expect(onRun).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Nothing runs until you say so/)).toBeTruthy();
  expect(screen.getByText(/That runs fly deploy/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show me first' }));
  fireEvent.click(screen.getByRole('button', { name: 'Run it' }));
  expect(onRun).toHaveBeenCalledWith('npm test');
});

test('Enter is sent after the command, not inside it', () => {
  const calls = [];
  typeCommand({ input: (data) => calls.push(data) }, 'npm test');
  expect(calls).toEqual(['\x15', 'npm test', '\r']);
  calls.length = 0;
  typeCommand({ paste: (data) => calls.push(data) }, 'npm test');
  expect(calls).toEqual([]);
});
