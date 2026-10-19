/**
 * @jest-environment jsdom
 */
// Censai the orchestrator in the pinned chat: a plan's live card with the
// checklist of the part at work, its one result line with the "What I
// checked" fold, and Stop.
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/chat.js', () => ({ sendMessageWithMeta: jest.fn() }));
jest.unstable_mockModule('../src/lib/api/agentActivity.js', () => ({ getMailActivity: jest.fn(), getAgentActivity: jest.fn() }));
jest.unstable_mockModule('../src/lib/api/censaiPlans.js', () => ({
  getOpenPlans: jest.fn(), markPlanTold: jest.fn(), stopPlanRun: jest.fn(),
}));

const { CensaiPinnedChat } = await import('../src/components/censai/CensaiPinnedChat.jsx');
const { CensaiPlanCard } = await import('../src/components/censai/CensaiPlanCard.jsx');
const { CensaiPlanChecked } = await import('../src/components/censai/CensaiPlanChecked.jsx');
const { checkedOff, planResultMessage, planSnapshot, runningLine, visibleSteps } = await import('../src/lib/censai/plans.js');
const { sendMessageWithMeta } = await import('../src/lib/chat.js');
const { getMailActivity } = await import('../src/lib/api/agentActivity.js');
const { getOpenPlans, markPlanTold, stopPlanRun } = await import('../src/lib/api/censaiPlans.js');

const THREADS_KEY = 'homebase.messenger.v1';
const PINNED_KEY = 'homebase.censai.pinned.v1';
const step = (text, state) => ({ at: '2026-10-18T21:30:00Z', text, state });
const item = (n, text, state, line = '', over = {}) => ({ n, text, how: 'answer', state, line, ...over });

const running = {
  id: 'plan-1', goal: 'Show the date in the header', status: 'running', summary: null, updatedAt: 'a',
  jobs: [
    {
      n: 1, agentId: 'nexus', agent: 'Nexus', title: 'Add the date to the header.', status: 'checking', seen: [],
      steps: [step('Handed to Nexus', 'done'), step('Nexus answered', 'done'), step('Checking all 2 items on the list', 'now')],
      checklist: [
        item(1, 'The header shows today\'s date', 'ticked', 'The header now shows the date.'),
        item(2, 'The project\'s tests pass', 'checking', 'Running the project\'s tests', { how: 'tests', auto: true }),
      ],
    },
    {
      n: 2, agentId: 'echo', agent: 'Echo', title: 'Write the changelog line.', status: 'waiting', seen: [], steps: [],
      checklist: [item(1, 'One plain line', 'open')],
    },
  ],
};

const done = {
  ...running, status: 'done', updatedAt: 'b', summary: 'Nexus added the date to the header, and the project\'s 12 tests pass.',
  jobs: [
    {
      ...running.jobs[0], status: 'done', answer: 'I added the date to src/Header.jsx.',
      steps: [step('Handed to Nexus', 'done'), step('Nexus answered', 'done'), step('All 2 checked off', 'done')],
      seen: ['Nexus changed 1 file: src/Header.jsx.', 'The project\'s tests passed (12 tests).'],
      checklist: [
        item(1, 'The header shows today\'s date', 'ticked', 'The header now shows the date.'),
        item(2, 'The project\'s tests pass', 'ticked', 'The project\'s tests passed (12 tests).', { how: 'tests', auto: true }),
      ],
    },
    {
      ...running.jobs[1], status: 'done', answer: 'Added: the header shows today\'s date.',
      checklist: [item(1, 'One plain line', 'ticked', 'It is one plain line.')],
    },
  ],
};

beforeEach(() => {
  window.localStorage.removeItem(THREADS_KEY);
  window.localStorage.removeItem(PINNED_KEY);
  for (const mock of [sendMessageWithMeta, getMailActivity, getOpenPlans, markPlanTold, stopPlanRun]) mock.mockReset();
  getMailActivity.mockResolvedValue([]);
  getOpenPlans.mockResolvedValue([]);
});

describe('plan words', () => {
  test('the live card shows every step of the job at work and the last line of the rest', () => {
    expect(visibleSteps(running.jobs[0]).map((s) => s.text)).toEqual(['Handed to Nexus', 'Nexus answered', 'Checking all 2 items on the list']);
    expect(visibleSteps(running.jobs[1])).toEqual([]);
    expect(visibleSteps(done.jobs[0]).map((s) => s.text)).toEqual(['All 2 checked off']);
    expect(checkedOff(running.jobs[0])).toBe('1 of 2 checked off');
    expect(checkedOff(done.jobs[0])).toBe('All 2 checked off');
    expect(checkedOff(running.jobs[1])).toBe('Not checked off yet');
    expect(runningLine(1)).toBe('Working on a plan in the background');
    expect(runningLine(2)).toBe('Working on 2 plans in the background');
  });

  test('the result message keeps the checked-off list, clipped, and the line Censai says', () => {
    const message = planResultMessage(done, 5);
    expect(message).toMatchObject({ from: 'censai', text: done.summary, ts: 5 });
    expect(message.plan.jobs[0].checklist[1]).toEqual({
      n: 2, text: 'The project\'s tests pass', how: 'tests', state: 'ticked', line: 'The project\'s tests passed (12 tests).',
    });
    expect(message.plan.jobs[0].seen).toEqual(done.jobs[0].seen);
    const long = planSnapshot({ ...done, jobs: [{ ...done.jobs[0], answer: 'x'.repeat(5000), checklist: [{ ...done.jobs[0].checklist[1], detail: 'y'.repeat(3000) }] }] });
    expect(long.jobs[0].answer.length).toBeLessThanOrEqual(1500);
    expect(long.jobs[0].checklist[0].detail.length).toBeLessThanOrEqual(1500);
  });
});

describe('the plan card and the fold', () => {
  test('the card names who has each part, what is happening now, and the list as it is checked off', () => {
    const onStop = jest.fn();
    render(<CensaiPlanCard plan={running} onStop={onStop} />);
    const card = screen.getByTestId('censai-plan');
    expect(within(card).getByText('Show the date in the header')).toBeInTheDocument();
    expect(within(card).getByText('Checking all 2 items on the list')).toBeInTheDocument();
    expect(within(card).getByText('1 of 2 checked off')).toBeInTheDocument();
    expect(within(card).getByText('The header now shows the date.')).toBeInTheDocument();
    const testsItem = within(card).getByText('The project\'s tests pass').closest('li');
    expect(testsItem).toHaveAttribute('data-state', 'checking');
    expect(within(testsItem).getByText('Checking now:')).toBeInTheDocument();
    // A part waiting its turn shows its count, not its list.
    expect(within(card).getByText('Waiting its turn')).toBeInTheDocument();
    expect(within(card).queryByText('One plain line')).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Stop the plan: Show the date in the header' }));
    expect(onStop).toHaveBeenCalledWith('plan-1');
  });

  test('"What I checked" folds out to each checked-off item, how it was checked, the test output and what each said', () => {
    const failing = {
      ...done, status: 'stuck',
      jobs: [{
        ...done.jobs[0], status: 'stuck', stuckOn: 2, error: 'Nexus tried twice and it still does not check out.',
        checklist: [done.jobs[0].checklist[0], { ...done.jobs[0].checklist[1], state: 'failed', line: 'The project\'s tests failed (1 of 12 failed).', detail: 'FAIL tests/header.test.js' }],
      }, { ...done.jobs[1], status: 'skipped', checklist: [item(1, 'One plain line', 'unknown', 'Not checked: this part did not start.')] }],
    };
    render(<CensaiPlanChecked plan={planSnapshot(failing)} />);
    expect(screen.getByText('What I checked')).toBeInTheDocument();
    expect(screen.getByText('The header now shows the date.')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 checked off')).toBeInTheDocument();
    expect(screen.getByText('Not true yet:')).toBeInTheDocument();
    expect(screen.getByText('The project\'s tests failed (1 of 12 failed).')).toBeInTheDocument();
    expect(screen.getByText('FAIL tests/header.test.js')).toBeInTheDocument();
    expect(screen.getByText('Not checked: this part did not start.')).toBeInTheDocument();
    expect(screen.getByText('Nexus changed 1 file: src/Header.jsx.')).toBeInTheDocument();
    expect(screen.getByText('What Nexus said')).toBeInTheDocument();
    // Stuck on an item: the item says why, not a second line under it.
    expect(screen.queryByText('Nexus tried twice and it still does not check out.')).not.toBeInTheDocument();
  });
});

describe('in the pinned chat', () => {
  test('a running plan shows live in Censai\'s thread, and Stop stops it with one line back', async () => {
    getOpenPlans.mockResolvedValueOnce([running]);
    const stopped = {
      ...running, status: 'stopped', updatedAt: 'c', summary: 'Stopped while Nexus was on part 1, as you asked. Echo did not start.',
      jobs: [{ ...running.jobs[0], status: 'stopped' }, { ...running.jobs[1], status: 'skipped' }],
    };
    stopPlanRun.mockResolvedValue(stopped);
    markPlanTold.mockResolvedValue({ first: true, plan: stopped });
    render(<CensaiPinnedChat workspaceId="ws-1" />);
    fireEvent.click(screen.getByLabelText('Open chat with Censai'));
    const card = await screen.findByTestId('censai-plan');
    expect(within(card).getByText('Checking all 2 items on the list')).toBeInTheDocument();
    expect(screen.getByText('Working on a plan in the background')).toBeInTheDocument();

    getOpenPlans.mockResolvedValueOnce([stopped]);
    fireEvent.click(within(card).getByRole('button', { name: /Stop the plan/ }));
    expect(await screen.findByText(stopped.summary)).toBeInTheDocument();
    expect(stopPlanRun).toHaveBeenCalledWith({ workspaceId: 'ws-1', id: 'plan-1' });
    expect(markPlanTold).toHaveBeenCalledWith({ workspaceId: 'ws-1', id: 'plan-1' });
    expect(screen.queryByTestId('censai-plan')).not.toBeInTheDocument();
  });

  test('a plan that finished while the chat was shrunk waits as one new line with its fold', async () => {
    getOpenPlans.mockResolvedValueOnce([done]);
    markPlanTold.mockResolvedValue({ first: true, plan: done });
    render(<CensaiPinnedChat workspaceId="ws-1" />);
    expect(await screen.findByLabelText('1 new')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Open chat with Censai'));
    expect(screen.getByText(done.summary)).toBeInTheDocument();
    expect(screen.getByText('What I checked')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(THREADS_KEY));
    expect(stored.censai).toHaveLength(1);
    expect(stored.censai[0].plan.jobs).toHaveLength(2);
  });

  test('another tab already posted it: nothing is added twice', async () => {
    getOpenPlans.mockResolvedValueOnce([done]);
    markPlanTold.mockResolvedValue({ first: false, plan: done });
    render(<CensaiPinnedChat workspaceId="ws-1" />);
    fireEvent.click(screen.getByLabelText('Open chat with Censai'));
    await screen.findByText(/hand the specialist work to the family/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markPlanTold).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(done.summary)).not.toBeInTheDocument();
  });

  test('after Censai answers, the chat looks for a plan he just handed out', async () => {
    sendMessageWithMeta.mockResolvedValue({ text: 'Here is the plan: Nexus adds the date, then Echo writes the line.', tools: [{ tool: 'hand_off_jobs', ok: true }] });
    // Nothing on the first look; the plan is there once Censai has answered.
    getOpenPlans.mockResolvedValueOnce([]).mockResolvedValueOnce([running]);
    render(<CensaiPinnedChat workspaceId="ws-1" />);
    fireEvent.click(screen.getByLabelText('Open chat with Censai'));
    fireEvent.change(screen.getByLabelText('Message Censai'), { target: { value: 'show the date in the header' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    expect(await screen.findByTestId('censai-plan')).toBeInTheDocument();
    expect(screen.getByText(/Here is the plan/)).toBeInTheDocument();
  });
});
