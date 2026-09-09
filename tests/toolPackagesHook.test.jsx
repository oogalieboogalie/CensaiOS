/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useToolPackages } from '../src/components/registry/useToolPackages.js';
import { ToolPackagesTab } from '../src/components/registry/ToolPackagesTab.jsx';

function Harness({ client }) {
  const state = useToolPackages(client, true);
  return <div data-testid="state">{state.error || state.packages.map(pkg => pkg.id).join(',')}</div>;
}

test('a stale workspace response cannot replace the current package state', async () => {
  let resolveOld;
  const oldClient = {
    listToolPackages: jest.fn(() => new Promise(resolve => { resolveOld = resolve; })),
    installToolPackage: jest.fn(), removeToolPackage: jest.fn(),
  };
  const currentClient = {
    listToolPackages: jest.fn(async () => ({ packages: [{ id: 'current-package' }], canManage: true })),
    installToolPackage: jest.fn(), removeToolPackage: jest.fn(),
  };
  const view = render(<Harness client={oldClient} />);
  view.rerender(<Harness client={currentClient} />);
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('current-package'));
  resolveOld({ packages: [{ id: 'stale-package' }], canManage: true });
  await Promise.resolve();
  expect(screen.getByTestId('state')).toHaveTextContent('current-package');
  expect(screen.getByTestId('state')).not.toHaveTextContent('stale-package');
});

test('load failures are visible and viewer controls remain disabled', async () => {
  const client = {
    listToolPackages: jest.fn(async () => { throw new Error('Add-ons unavailable'); }),
    installToolPackage: jest.fn(), removeToolPackage: jest.fn(),
  };
  render(<Harness client={client} />);
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('Add-ons unavailable'));

  const install = jest.fn();
  render(<ToolPackagesTab ready canManage={false} busyIds={new Set()} onInstall={install}
    onRemove={jest.fn()} packages={[{
      id: 'censai/web-research', name: 'Web Research', version: '1.0.0', description: 'Search',
      publisher: { name: 'Censai Core' }, module: { risk: 'read', mode: 'autonomous', tools: ['web_search'] },
      installed: false,
    }]} />);
  const button = screen.getByTestId('registry-package-install');
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(install).not.toHaveBeenCalled();
});
