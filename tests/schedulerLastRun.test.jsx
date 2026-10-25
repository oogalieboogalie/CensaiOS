/** @jest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { SchedulerTimelineItem } from '../src/components/scheduler/SchedulerTimelineItem.jsx';
import { plainScheduleError, shouldClearScheduleError } from '../src/components/scheduler/plainScheduleError.js';

const NOW = new Date('2026-10-21T15:00:00.000Z');
const ANSWER = 'Monday update: 3 new leads';
const RAW = 'update or delete on table "schedules" violates foreign key constraint "run_causes_schedule_id_fkey"';

function card() {
  return {
    id: 'sched-1',
    agent_id: 'censai',
    task_text: 'Check new leads',
    project_name: 'Example board',
    scheduled_time: '9:00 AM',
    scheduled_date: '2026-10-20',
    status: 'completed',
    last_result: ANSWER,
    last_run_at: '2026-10-20T15:00:00.000Z',
  };
}

afterEach(() => cleanup());

test('shows Last run with the stand-in answer and asks once before delete', () => {
  const handleDeleteSchedule = jest.fn();
  render(
    <SchedulerTimelineItem
      s={card()}
      now={NOW}
      handleToggleStatus={jest.fn()}
      handleDeleteSchedule={handleDeleteSchedule}
    />
  );

  const note = screen.getByText(/Last run/);
  expect(note).toHaveTextContent(ANSWER);
  expect(note).toHaveTextContent(/Last run/);

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(handleDeleteSchedule).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: 'Delete this schedule?' }))
    .toHaveTextContent('Delete this schedule? Its finished run stays on record.');

  fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(handleDeleteSchedule).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
  expect(handleDeleteSchedule).toHaveBeenCalledTimes(1);
  expect(handleDeleteSchedule).toHaveBeenCalledWith('sched-1');
});

test('a raw database error becomes plain words and a quiet refresh keeps it', () => {
  const plain = plainScheduleError(RAW);
  expect(plain).toBe('The schedule could not be changed. Try again in a moment.');
  expect(plain).not.toMatch(/violates|run_causes/);
  expect(plainScheduleError('Failed to delete schedule')).toBe('Failed to delete schedule');
  expect(plainScheduleError('')).toBe('');
  expect(shouldClearScheduleError({ quiet: true, loadFailed: false })).toBe(false);
  expect(shouldClearScheduleError({ quiet: true, loadFailed: true })).toBe(true);
  expect(shouldClearScheduleError({ quiet: false, loadFailed: false })).toBe(true);
});
