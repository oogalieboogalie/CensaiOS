/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { useRegistryInstalls } from '../src/components/registry/useRegistryInstalls.js';

function Harness({ client }) {
  const state = useRegistryInstalls(client, true);
  return <>
    <div data-testid="ready">{String(state.ready)}</div>
    <div data-testid="ids">{Object.keys(state.installed).join(',')}</div>
    <div data-testid="error">{state.error}</div>
    <button type="button" onClick={() => state.install('agent:architect')}>install</button>
  </>;
}

test('stale workspace load cannot overwrite the current client', async () => {
  let resolveOld;
  const oldClient = {
    listInstalled: jest.fn(() => new Promise(resolve => { resolveOld = resolve; })),
    installCard: jest.fn(), uninstallCard: jest.fn(),
  };
  const nextClient = {
    listInstalled: jest.fn(async () => ({
      installed: { 'agent:censai': { installedAt: 'new' } }, canManage: true,
    })),
    installCard: jest.fn(), uninstallCard: jest.fn(),
  };
  const view = render(<Harness client={oldClient} />);
  view.rerender(<Harness client={nextClient} />);
  await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('agent:censai'));
  await act(async () => resolveOld({
    installed: { 'agent:architect': { installedAt: 'old' } }, canManage: true,
  }));
  expect(screen.getByTestId('ids')).toHaveTextContent('agent:censai');
  expect(screen.getByTestId('ids')).not.toHaveTextContent('agent:architect');
});

test('failed install keeps the durable snapshot and exposes the error', async () => {
  const client = {
    listInstalled: jest.fn(async () => ({ installed: {}, canManage: true })),
    installCard: jest.fn(async () => { throw new Error('save denied'); }),
    uninstallCard: jest.fn(),
  };
  render(<Harness client={client} />);
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));
  fireEvent.click(screen.getByRole('button', { name: 'install' }));
  await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('save denied'));
  expect(screen.getByTestId('ids')).toBeEmptyDOMElement();
  expect(client.listInstalled).toHaveBeenCalledTimes(1);
});
