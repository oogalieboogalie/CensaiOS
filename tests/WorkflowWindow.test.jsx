/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkflowWindow } from '../src/components/WorkflowWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  useWorkspaceStore.setState({ wins: [] });
  global.fetch = jest.fn();
});

afterEach(cleanup);

describe('WorkflowWindow', () => {
  test('renders without throwing and displays title and step count', () => {
    const win = {
      id: 'w-wf',
      kind: 'workflow',
      title: 'Custom Workflow',
      steps: [
        { id: 's1', kind: 'agent', agentId: 'censai', title: 'Plan feature' },
      ],
    };
    const onUpdate = jest.fn();

    render(<WorkflowWindow win={win} onUpdate={onUpdate} />);

    expect(screen.getByText('Custom Workflow')).toBeInTheDocument();
    expect(screen.getByText('1 steps')).toBeInTheDocument();
    expect(screen.getByText('Plan feature')).toBeInTheDocument();
  });

  test('clicking Edit button toggles edit mode and allows updating title', () => {
    const win = {
      id: 'w-wf',
      kind: 'workflow',
      title: 'Custom Workflow',
      steps: [
        { id: 's1', kind: 'agent', agentId: 'censai', title: 'Plan feature' },
      ],
    };
    const onUpdate = jest.fn();

    render(<WorkflowWindow win={win} onUpdate={onUpdate} />);

    const editBtn = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(editBtn);

    const titleInput = screen.getByLabelText('Workflow name');
    expect(titleInput).toBeInTheDocument();

    fireEvent.change(titleInput, { target: { value: 'New Workflow Title' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'New Workflow Title' });
  });

  test('clicking Run button triggers workflow start', () => {
    const win = {
      id: 'w-wf',
      kind: 'workflow',
      title: 'Custom Workflow',
      steps: [
        { id: 's1', kind: 'agent', agentId: 'censai', title: 'Plan feature' },
      ],
    };
    const onUpdate = jest.fn();

    render(<WorkflowWindow win={win} onUpdate={onUpdate} />);

    const runBtn = screen.getByRole('button', { name: 'Run' });
    fireEvent.click(runBtn);

    expect(onUpdate).toHaveBeenCalledWith({
      run: expect.objectContaining({
        status: 'running',
        current: 0,
        outputs: {},
      }),
    });
  });
});
