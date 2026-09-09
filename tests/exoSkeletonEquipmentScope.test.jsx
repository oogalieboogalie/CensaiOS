/** @jest-environment jsdom */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExoSkeletonAttributes } from '../src/components/ExoSkeletonAttributes.jsx';

const api = {
  getAgentCapabilities: jest.fn().mockResolvedValue({ capabilities: [], modules: [] }),
  getAgentDebugTools: jest.fn().mockResolvedValue({ tools: [], moduleTools: [] }),
  getAttributes: jest.fn().mockResolvedValue({ attributes: [] }),
  getAgentAttributes: jest.fn().mockResolvedValue({ attributes: [] }),
  getMindsets: jest.fn().mockResolvedValue({ mindsets: [] }),
  getAgentMindsets: jest.fn().mockResolvedValue({ mindsets: [] }),
  compilePromptPreview: jest.fn().mockResolvedValue({ compiled: 'Scoped prompt' }),
  saveAgentCapabilities: jest.fn().mockResolvedValue({ ok: true }),
};

jest.unstable_mockModule('../src/lib/api.js', () => ({ api }));

const { useAgentConfiguration } = await import('../src/components/exoskeleton/useAgentConfiguration.js');
const { useWorkspaceStore } = await import('../src/lib/store.js');
const originalWorkspaceId = useWorkspaceStore.getState().workspaceId;

function ConfigurationHarness() {
  const configuration = useAgentConfiguration({ id: 'atlas', name: 'Atlas', role: 'Backend' });
  return <>
    <div data-testid="configuration-error">{configuration.saveError}</div>
    <div data-testid="module-tools">{configuration.moduleTools.join(',')}</div>
    <div data-testid="modules-ready">{String(configuration.modulesReady)}</div>
    <button type="button" onClick={() => configuration.saveCapabilities({ head: 'web-research' })}>
      Save module
    </button>
  </>;
}

beforeEach(() => {
  jest.clearAllMocks();
  api.getAgentCapabilities.mockResolvedValue({ capabilities: [], modules: [] });
  api.getAgentDebugTools.mockResolvedValue({ tools: [], moduleTools: [] });
  api.getAttributes.mockResolvedValue({ attributes: [] });
  api.getAgentAttributes.mockResolvedValue({ attributes: [] });
  api.getMindsets.mockResolvedValue({ mindsets: [] });
  api.getAgentMindsets.mockResolvedValue({ mindsets: [] });
  api.compilePromptPreview.mockResolvedValue({ compiled: 'Scoped prompt' });
  api.saveAgentCapabilities.mockResolvedValue({ ok: true });
  act(() => useWorkspaceStore.setState({ workspaceId: null }));
});

afterEach(() => cleanup());

afterAll(() => {
  act(() => useWorkspaceStore.setState({ workspaceId: originalWorkspaceId }));
});

describe('Exo-Skeleton equipment scope', () => {
  test('blocks configuration when no workspace is active', () => {
    render(React.createElement(ExoSkeletonAttributes, {
      agent: { id: 'atlas', name: 'Atlas' },
      allAttributes: [],
      equippedAttributes: [],
      allMindsets: [],
      equippedMindsets: [],
      previewPrompt: '',
      saveError: 'Open a workspace to configure this agent.',
      scopeBlocked: true,
    }));

    expect(screen.getByRole('status')).toHaveTextContent('Open a workspace to configure this agent');
    expect(screen.queryByText('Persona attributes')).not.toBeInTheDocument();
  });

  test('clears the no-workspace error when a scoped load begins', async () => {
    render(React.createElement(ConfigurationHarness));
    expect(await screen.findByText('Open a workspace to configure this agent.')).toBeInTheDocument();

    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-1' }));

    await waitFor(() => expect(screen.getByTestId('configuration-error')).toBeEmptyDOMElement());
    expect(api.getAgentCapabilities).toHaveBeenCalledWith('atlas', 'workspace-1');
    expect(api.getAgentDebugTools).toHaveBeenCalledWith('atlas', 'workspace-1');
    expect(api.getAgentAttributes).toHaveBeenCalledWith('atlas', 'workspace-1');
    expect(api.getAgentMindsets).toHaveBeenCalledWith('atlas', 'workspace-1');
  });

  test('saves canonical family modules only through the active workspace', async () => {
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-1' }));
    render(React.createElement(ConfigurationHarness));
    await waitFor(() => expect(screen.getByTestId('modules-ready')).toHaveTextContent('true'));

    fireEvent.click(screen.getByRole('button', { name: 'Save module' }));

    await waitFor(() => expect(api.saveAgentCapabilities).toHaveBeenCalledWith(
      'atlas', ['web-research'], 'workspace-1',
    ));
  });

  test('locks and clears module state while a different workspace loads', async () => {
    let releaseWorkspaceTwo;
    api.getAgentDebugTools.mockImplementation((_agentId, workspaceId) => workspaceId === 'workspace-2'
      ? new Promise(resolve => { releaseWorkspaceTwo = resolve; })
      : Promise.resolve({ tools: ['read_calendar'], moduleTools: ['read_calendar'] }));
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-1' }));
    render(React.createElement(ConfigurationHarness));
    await waitFor(() => expect(screen.getByTestId('modules-ready')).toHaveTextContent('true'));
    expect(screen.getByTestId('module-tools')).toHaveTextContent('read_calendar');

    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-2' }));
    await waitFor(() => expect(screen.getByTestId('modules-ready')).toHaveTextContent('false'));
    expect(screen.getByTestId('module-tools')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: 'Save module' }));
    expect(api.saveAgentCapabilities).not.toHaveBeenCalled();
    expect(screen.getByTestId('configuration-error')).toHaveTextContent('finish loading');

    await act(async () => releaseWorkspaceTwo({ tools: [], moduleTools: [] }));
    await waitFor(() => expect(screen.getByTestId('modules-ready')).toHaveTextContent('true'));
  });

  test('ignores a stale module response from the previous workspace', async () => {
    let releaseWorkspaceOne;
    api.getAgentDebugTools.mockImplementation((_agentId, workspaceId) => workspaceId === 'workspace-1'
      ? new Promise(resolve => { releaseWorkspaceOne = resolve; })
      : Promise.resolve({ tools: ['github_read_file'], moduleTools: ['github_read_file'] }));
    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-1' }));
    render(React.createElement(ConfigurationHarness));
    await waitFor(() => expect(releaseWorkspaceOne).toEqual(expect.any(Function)));

    act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-2' }));
    await waitFor(() => expect(screen.getByTestId('modules-ready')).toHaveTextContent('true'));
    expect(screen.getByTestId('module-tools')).toHaveTextContent('github_read_file');

    await act(async () => releaseWorkspaceOne({ tools: ['read_calendar'], moduleTools: ['read_calendar'] }));
    expect(screen.getByTestId('module-tools')).toHaveTextContent('github_read_file');
    expect(screen.getByTestId('module-tools')).not.toHaveTextContent('read_calendar');
  });
});
