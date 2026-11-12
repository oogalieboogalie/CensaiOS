/**
 * @jest-environment jsdom
 */
// A finished run where no agent succeeded used to show "null/6" in History:
// the server sends null for a count of zero. The card now shows 0.
import { render, screen } from '@testing-library/react';
import { RunCard } from '../src/components/windows/vex/VexComponents.jsx';

describe('a past run in Vex Orchestrator', () => {
  test('shows 0, not "null", when no agent succeeded', () => {
    render(<RunCard run={{ run_id: 'run_1_abc', status: 'complete', agents_succeeded: null, agents_dispatched: 6 }} onClick={() => {}} />);
    expect(screen.getByText('0/6')).toBeTruthy();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  test('is a button, marked as the chosen one when it is', () => {
    render(<RunCard run={{ run_id: 'run_2_def', status: 'complete', agents_succeeded: 6, agents_dispatched: 6, task: 'demo' }} isActive onClick={() => {}} />);
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('6/6').getAttribute('data-tone')).toBe('good');
  });
});
