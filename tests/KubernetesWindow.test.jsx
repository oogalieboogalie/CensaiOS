/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { KubernetesWindow } from '../src/components/KubernetesWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  useWorkspaceStore.setState({ wins: [] });
  global.fetch = jest.fn();
});

afterEach(cleanup);

describe('KubernetesWindow', () => {
  test('renders without throwing and displays title and loading state before fetch resolves', async () => {
    let resolveFetch;
    global.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

    const win = { id: 'w-k8s', kind: 'kubernetes', title: 'Kubernetes Cluster' };
    const onUpdate = jest.fn();

    render(<KubernetesWindow win={win} onUpdate={onUpdate} />);

    expect(screen.getByText('Kubernetes Cluster')).toBeInTheDocument();
    expect(screen.getByText('Loading cluster state...')).toBeInTheDocument();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ namespaces: [], deployments: [], pods: [] }),
      });
    });
  });

  test('fetches status and renders namespaces, deployments, and pods', async () => {
    const mockStatusData = {
      namespaces: [{ name: 'default', status: 'Active' }],
      deployments: [{ name: 'web-deploy', namespace: 'default', replicas: 1, readyReplicas: 1 }],
      pods: [{ name: 'web-pod-abc', namespace: 'default', status: 'Running', restarts: 0 }],
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockStatusData,
    });

    const win = { id: 'w-k8s', kind: 'kubernetes' };
    const onUpdate = jest.fn();

    render(<KubernetesWindow win={win} onUpdate={onUpdate} />);

    expect(global.fetch).toHaveBeenCalledWith('/api/kubernetes/status');

    await waitFor(() => {
      expect(screen.getByText('Namespaces (1)')).toBeInTheDocument();
    });

    expect(screen.getAllByText('default').length).toBeGreaterThan(0);
    expect(screen.getByText('web-deploy')).toBeInTheDocument();
    expect(screen.getByText('web-pod-abc')).toBeInTheDocument();
  });
});
