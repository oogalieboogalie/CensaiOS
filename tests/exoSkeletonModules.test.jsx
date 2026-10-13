/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExoSkeletonModules } from '../src/components/ExoSkeletonModules.jsx';

const empty = { head: null, mainHand: null, offHand: null, trinket: null };
const agent = { id: 'atlas', name: 'Atlas', glyph: 'A', hue: 220 };
const installed = ['web-research', 'project-writer'];

test('shows truthful read-only modules and commits visual state only after persistence', async () => {
  let resolveSave;
  const saveCapabilities = jest.fn(() => new Promise(resolve => { resolveSave = resolve; }));
  const setEquipped = jest.fn();
  const onUpdate = jest.fn();
  render(<ExoSkeletonModules
    agent={agent}
    equipped={empty}
    setEquipped={setEquipped}
    moduleTools={[]}
    installedModuleIds={installed}
    saveCapabilities={saveCapabilities}
    onUpdate={onUpdate}
  />);

  fireEvent.click(screen.getAllByText('Click to Equip')[0]);
  expect(screen.getByText('Web Research')).toBeInTheDocument();
  expect(screen.getByText(/does not control a browser/i)).toBeInTheDocument();
  expect(screen.queryByText(/Terminal Access|Browser Actuator|unrestricted/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Web Research'));

  expect(saveCapabilities).toHaveBeenCalledWith({ ...empty, head: 'web-research' });
  expect(setEquipped).not.toHaveBeenCalled();
  resolveSave(true);
  await waitFor(() => expect(setEquipped).toHaveBeenCalledWith({ ...empty, head: 'web-research' }));
  expect(onUpdate).toHaveBeenCalledWith({ equipped: { ...empty, head: 'web-research' } });
});

test('a failed save leaves the rendered selection unchanged', async () => {
  const setEquipped = jest.fn();
  const onUpdate = jest.fn();
  render(<ExoSkeletonModules
    agent={agent}
    equipped={empty}
    setEquipped={setEquipped}
    moduleTools={['web_search']}
    installedModuleIds={installed}
    saveCapabilities={jest.fn().mockResolvedValue(false)}
    onUpdate={onUpdate}
  />);

  fireEvent.click(screen.getAllByText('Click to Equip')[0]);
  fireEvent.click(screen.getByText('Web Research'));
  await waitFor(() => expect(screen.getByText('Web Research')).toBeInTheDocument());
  expect(setEquipped).not.toHaveBeenCalled();
  expect(onUpdate).not.toHaveBeenCalled();
  expect(screen.getByText('web_search')).toBeInTheDocument();
});

test('write modules state their exact approval boundary', () => {
  render(<ExoSkeletonModules agent={agent} equipped={empty} setEquipped={jest.fn()}
    moduleTools={[]} installedModuleIds={installed} saveCapabilities={jest.fn()} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getAllByText('Click to Equip')[1]);
  expect(screen.getByText('Project Writer')).toBeInTheDocument();
  expect(screen.getByText(/With Trust mode off, every call waits for an owner or admin/)).toBeInTheDocument();
  expect(screen.getByText(/Write · acts on its own in Trust mode · project_write, project_edit/)).toBeInTheDocument();
});

test('an uninstalled add-on cannot be equipped by a plain click', () => {
  const saveCapabilities = jest.fn();
  const onRefresh = jest.fn();
  render(<ExoSkeletonModules agent={agent} equipped={empty} setEquipped={jest.fn()}
    moduleTools={[]} installedModuleIds={[]} saveCapabilities={saveCapabilities}
    onRefresh={onRefresh} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getAllByText('Click to Equip')[0]);
  expect(screen.getByRole('button', { name: 'Install and equip' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Web Research'));
  expect(saveCapabilities).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /refresh add-ons/i }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('Install and equip installs the add-on, then equips it in one click', async () => {
  const installModule = jest.fn().mockResolvedValue(true);
  const saveCapabilities = jest.fn().mockResolvedValue(true);
  const setEquipped = jest.fn();
  const onUpdate = jest.fn();
  render(<ExoSkeletonModules agent={agent} equipped={empty} setEquipped={setEquipped}
    moduleTools={[]} installedModuleIds={[]} installModule={installModule}
    saveCapabilities={saveCapabilities} onUpdate={onUpdate} />);
  fireEvent.click(screen.getAllByText('Click to Equip')[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Install and equip' }));
  await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  expect(installModule).toHaveBeenCalledWith('web-research');
  expect(saveCapabilities).toHaveBeenCalledWith({ ...empty, head: 'web-research' });
  expect(setEquipped).toHaveBeenCalledWith({ ...empty, head: 'web-research' });
});

test('a failed install or save is shown, not swallowed', () => {
  render(<ExoSkeletonModules agent={agent} equipped={empty} setEquipped={jest.fn()}
    moduleTools={[]} installedModuleIds={[]} saveError="Only owners can install add-ons."
    saveCapabilities={jest.fn()} onUpdate={jest.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Only owners can install add-ons.');
});
