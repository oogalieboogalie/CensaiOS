/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TaskQueuePanel } from '../src/components/operations/TaskQueuePanel.jsx';

describe('Operations receipt modal', () => {
  test('opens completion receipts in a constrained page-level dialog', () => {
    const longPath = 'C:\\Homebase\\CensaiHub\\.team\\handoffs\\2026-06-09-bug-when-clicking-the-completion-reciepts-on-the-live-operations-board-it-makes-.md';
    const tasks = [{
      id: 'task-1',
      title: 'Receipt modal fix',
      status: 'completed',
      completed_at: '2026-06-09T01:00:00.000Z',
      completion_receipt: {
        title: 'Receipt modal fix',
        status: 'completed',
        source: 'handoff',
        completedAt: '2026-06-09T01:00:00.000Z',
        summary: ['Kept the receipt viewer from stretching the board window.'],
        landed: [longPath],
        verify: ['Click a completion receipt from Live Operations.'],
      },
    }];

    const { container } = render(
      React.createElement(
        'div',
        { style: { transform: 'scale(1.8)' } },
        React.createElement(TaskQueuePanel, { tasks, subAgents: [] })
      )
    );

    const receiptPanel = screen.getByText('Completion Receipts').closest('section');
    fireEvent.click(within(receiptPanel).getByText('Receipt modal fix'));

    const dialog = screen.getByRole('dialog', { name: 'Completion Receipt' });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.querySelector('form')).toBeNull();
    expect(dialog.style.width).toBe('620px');
    expect(dialog.style.overflow).toBe('hidden');
    expect(dialog.style.gridTemplateRows).toBe('auto minmax(0, 1fr)');

    const receiptBody = within(dialog).getByText('Changed').closest('section').parentElement;
    expect(receiptBody.style.minHeight).toBe('0');
    expect(receiptBody.style.overflowY).toBe('auto');
    expect(within(dialog).getByText(longPath).closest('ul').style.overflowWrap).toBe('anywhere');
  });
});
