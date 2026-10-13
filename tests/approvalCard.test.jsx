/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ApprovalCard } from '../src/components/approvals/ApprovalCard.jsx';

const pending = {
  id: 'approval-1', status: 'pending', revision: 0, agent_id: 'censai', module_id: 'project-writer',
  tool_name: 'project_write', arguments: { project: 'demo', path: 'notes.md', content: 'exact draft' },
};

test('shows exact captured arguments and disables decisions for viewers', () => {
  render(<ApprovalCard approval={pending} canDecide={false} deciding={false} onDecision={jest.fn()} />);
  expect(screen.getByText('project_write')).toBeInTheDocument();
  expect(screen.getByText(/exact draft/)).toBeInTheDocument();
  expect(screen.getByText('Owner/admin decision required')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Approve once/ })).toBeDisabled();
});

test('owner decision is explicit and never optimistic inside the card', () => {
  const onDecision = jest.fn();
  render(<ApprovalCard approval={pending} canDecide deciding={false} onDecision={onDecision} />);
  fireEvent.click(screen.getByRole('button', { name: /Approve once/ }));
  expect(onDecision).toHaveBeenCalledWith(pending, 'approve');
  expect(screen.getByText('pending')).toBeInTheDocument();
});

test('executing state says it will not auto-retry', () => {
  render(<ApprovalCard approval={{ ...pending, status: 'executing' }} canDecide deciding={false} onDecision={jest.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('will not auto-retry');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
