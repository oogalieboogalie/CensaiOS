import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import { FAMILY_AGENT_IDS } from '../src/data/family-agents.js';
import { SCHEDULER_AGENTS } from '../src/components/scheduler/constants.js';
import {
  createSchedule,
  deleteSchedule,
  getSchedules,
  updateSchedule,
} from '../src/lib/api/schedules.js';

describe('schedule client contract', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('offers exactly the canonical family, not external dispatch adapters', () => {
    expect(SCHEDULER_AGENTS.map(agent => agent.id)).toEqual(FAMILY_AGENT_IDS);
    expect(FAMILY_AGENT_IDS).not.toContain('jules');
  });

  test('the active scheduler path cannot emit a Jules GitHub side effect', async () => {
    const actions = await fs.readFile(
      new URL('../src/components/scheduler/useSchedulerActions.js', import.meta.url), 'utf8'
    );
    expect(actions).not.toContain('createGithubIssue');
    expect(actions).not.toContain("selectedAgentId === 'jules'");
  });

  test('sends workspace scope on every schedule operation', async () => {
    await getSchedules('workspace-1');
    await createSchedule({ agent_id: 'censai' }, 'workspace-1');
    await updateSchedule('schedule-1', { status: 'inactive' }, 'workspace-1');
    await deleteSchedule('schedule-1', 'workspace-1');

    expect(global.fetch.mock.calls[0][0]).toContain('workspaceId=workspace-1');
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).workspaceId).toBe('workspace-1');
    expect(global.fetch.mock.calls[2][0]).toContain('workspaceId=workspace-1');
    expect(global.fetch.mock.calls[3][0]).toContain('workspaceId=workspace-1');
  });

  test('preserves backend errors instead of silently returning an empty list', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'Workspace access denied' }),
    });
    await expect(getSchedules('workspace-1')).rejects.toThrow('Workspace access denied');
  });

  test('refuses requests without an active workspace', async () => {
    expect(() => getSchedules('')).toThrow('Open a workspace');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
