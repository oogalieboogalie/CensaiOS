/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkflowWindow } from '../src/components/WorkflowWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const graph = {
  nodes: [
    { id: 'start', type: 'trigger', x: 20, y: 100, title: 'Start', mode: 'manual', input: 'open house' },
    { id: 'plan', type: 'agent', x: 240, y: 100, title: 'Plan feature', agentId: 'censai', instructions: 'Plan it.' },
    { id: 'card', type: 'output', x: 460, y: 100, title: 'Plan card' },
  ],
  edges: [{ id: 'e1', from: 'start', to: 'plan' }, { id: 'e2', from: 'plan', to: 'card' }],
};

function respond(body, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  useWorkspaceStore.setState({ wins: [], workspaceId: 'ws-1' });
  global.fetch = jest.fn((url, init = {}) => {
    if (String(url).endsWith('/trigger')) return respond({ trigger: { mode: 'manual' } });
    if (String(url).endsWith('/run') && init.method === 'POST') return respond({ ok: true, runId: 'run-1' });
    return respond({});
  });
});

afterEach(cleanup);

// The window reads its auto start from the server when it opens.
async function mount(ui) {
  await act(async () => { render(ui); });
}

async function press(button) {
  await act(async () => { fireEvent.click(button); });
}

describe('WorkflowWindow', () => {
  test('draws each step as a node with its kind and title', async () => {
    await mount(<WorkflowWindow win={{ id: 'w-wf', kind: 'workflow', title: 'Custom Workflow', graph }} onUpdate={jest.fn()} />);
    expect(screen.getByText('Custom Workflow')).toBeInTheDocument();
    expect(screen.getByText('3 steps')).toBeInTheDocument();
    expect(screen.getByText('Plan feature')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-wf-node]')).toHaveLength(3);
    expect(document.querySelectorAll('.hb-wf-wire')).toHaveLength(2);
  });

  test('an older step-list workflow opens as a chain of nodes and saves as a graph', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'w-old', kind: 'workflow', title: 'Old', steps: [{ id: 's1', kind: 'agent', agentId: 'censai', title: 'Plan feature' }] };
    await mount(<WorkflowWindow win={win} onUpdate={onUpdate} />);
    expect(screen.getByText('Plan feature')).toBeInTheDocument();
    const saved = onUpdate.mock.calls.find(([patch]) => patch.graph)?.[0].graph;
    expect(saved.nodes.map((n) => n.type)).toEqual(['trigger', 'agent', 'output']);
    expect(saved.edges).toHaveLength(2);
  });

  test('Rename lets you change the workflow name', async () => {
    const onUpdate = jest.fn();
    await mount(<WorkflowWindow win={{ id: 'w-wf', kind: 'workflow', title: 'Custom Workflow', graph }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Workflow name'), { target: { value: 'New Workflow Title' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'New Workflow Title' });
  });

  test('Run asks the server to run this window with the graph it shows', async () => {
    await mount(<WorkflowWindow win={{ id: 'w-wf', kind: 'workflow', title: 'Custom Workflow', graph }} onUpdate={jest.fn()} />);
    await press(screen.getByRole('button', { name: 'Run' }));
    const call = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/workflows/w-wf/run'));
    expect(call[0]).toBe('/api/workspaces/ws-1/workflows/w-wf/run');
    expect(JSON.parse(call[1].body).graph).toEqual(graph);
  });

  test('adding a step puts a new node on the canvas', async () => {
    const onUpdate = jest.fn();
    await mount(<WorkflowWindow win={{ id: 'w-wf', kind: 'workflow', graph }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /Check/ }));
    const next = onUpdate.mock.calls.at(-1)[0].graph;
    expect(next.nodes).toHaveLength(4);
    expect(next.nodes.at(-1).type).toBe('branch');
  });

  test('live run status from the board lights up each node, and a review step can be approved', async () => {
    const run = { id: 'run-1', status: 'awaiting_review', nodes: { start: { status: 'done' }, plan: { status: 'waiting', output: 'draft' }, card: { status: 'pending' } } };
    await mount(<WorkflowWindow win={{ id: 'w-wf', kind: 'workflow', graph, run }} onUpdate={jest.fn()} />);
    expect(document.querySelector('[data-wf-node="plan"]').getAttribute('data-status')).toBe('waiting');
    await press(screen.getByRole('button', { name: 'Approve' }));
    const call = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/review'));
    expect(JSON.parse(call[1].body)).toEqual({ runId: 'run-1', approve: true });
    // One Stop on the review step, one in the title bar for the whole run.
    expect(screen.getAllByRole('button', { name: 'Stop' })).toHaveLength(2);
  });
});
