/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { JulesQueuePanel } from '../src/components/jules/JulesQueuePanel.jsx';

describe('Jules queue panel', () => {
  test('shows live repository queue sections and counts', () => {
    render(React.createElement(JulesQueuePanel, {
      includeCompleted: true,
      queue: {
        autoMerge: true,
        counts: { pending: 1, inflight: 1, blocked: 1, dispatched: 1 },
        pending: [{ brief: 'next.md', title: 'Next task', status: 'pending' }],
        inflight: [{ brief: 'active.md', title: 'Active task', status: 'inflight', session: 'sessions/1' }],
        blocked: [{ brief: 'blocked.md', title: 'Blocked task', status: 'blocked', detail: 'Needs contract' }],
        dispatched: [{ brief: 'done.md', title: 'Merged task', status: 'merged' }],
      },
    }));

    expect(screen.getByText('1 pending · 1 active · 1 blocked')).toBeInTheDocument();
    expect(screen.getByText('auto-merge on')).toBeInTheDocument();
    expect(screen.getByText('Next task')).toBeInTheDocument();
    expect(screen.getByText('Active task')).toBeInTheDocument();
    expect(screen.getByText('Blocked task')).toBeInTheDocument();
    expect(screen.getByText('Merged task')).toBeInTheDocument();
  });
});
