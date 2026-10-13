import { buildJulesCompletionReceipt, deriveAgentTaskPatch, selectLatestReviewState } from '../server/jules-task-sync/index.js';
import { checkLinkedTodoPrContract } from '../server/jules-task-sync/steward.js';
import { evaluatePrFilesAgainstContract } from '../server/operational-intelligence/prSteward.js';

describe('Jules task sync mapping', () => {
  test('keeps a task in progress when Jules opens a PR', () => {
    const patch = deriveAgentTaskPatch({
      session: 'sessions/abc',
      julesStatus: 'COMPLETED',
      prNumber: 42,
      prUrl: 'https://github.com/oogalieboogalie/Homebase/pull/42',
      prState: 'open',
    });

    expect(patch).toEqual(expect.objectContaining({
      status: 'in_progress',
      error: null,
    }));
    expect(patch.result).toContain('PR: https://github.com/oogalieboogalie/Homebase/pull/42');
    expect(patch.result).toContain('PR state: open');
  });

  test('blocks a task when review requests changes', () => {
    const patch = deriveAgentTaskPatch({
      session: 'sessions/abc',
      julesStatus: 'COMPLETED',
      prUrl: 'https://github.com/oogalieboogalie/Homebase/pull/42',
      prState: 'open',
      reviewState: 'CHANGES_REQUESTED',
      reviewAuthor: 'reviewer',
    });

    expect(patch).toEqual(expect.objectContaining({
      status: 'blocked',
      error: null,
    }));
    expect(patch.result).toContain('Review: CHANGES_REQUESTED by reviewer');
  });

  test('completes a task when the PR is merged', () => {
    const patch = deriveAgentTaskPatch({
      session: 'sessions/abc',
      julesStatus: 'COMPLETED',
      prUrl: 'https://github.com/oogalieboogalie/Homebase/pull/42',
      prState: 'merged',
      reviewState: 'APPROVED',
      mergedAt: '2026-06-06T20:00:00.000Z',
    });

    expect(patch).toEqual(expect.objectContaining({
      status: 'completed',
      error: null,
    }));
    expect(patch.result).toContain('Merged: 2026-06-06T20:00:00.000Z');
  });

  test('merged Jules receipts include PR, branch, and changed files to inspect', () => {
    const receipt = buildJulesCompletionReceipt(
      {
        id: 'task-1',
        title: 'Ship weather window polish',
        prompt: 'Handoff file: C:\\Homebase\\CensaiHub\\.team\\handoffs\\weather.md',
      },
      {
        status: 'completed',
        result: 'Jules PR merged cleanly.',
      },
      {
        pr_url: 'https://github.com/oogalieboogalie/Homebase/pull/42',
        branch: 'jules/weather-polish',
      },
      [
        'src/components/WeatherWindow.jsx',
        'tests/weather.test.jsx',
      ]
    );

    expect(receipt.source).toBe('jules');
    expect(receipt.landed).toEqual(expect.arrayContaining([
      'PR: https://github.com/oogalieboogalie/Homebase/pull/42',
      'Branch: jules/weather-polish',
      'Path: src/components/WeatherWindow.jsx',
      'Path: tests/weather.test.jsx',
    ]));
    expect(receipt.verify[0]).toBe('Open the PR and confirm the merged diff matches the requested work.');
  });

  test('cancels a task when the PR closes without merge', () => {
    const patch = deriveAgentTaskPatch({
      session: 'sessions/abc',
      julesStatus: 'COMPLETED',
      prUrl: 'https://github.com/oogalieboogalie/Homebase/pull/42',
      prState: 'closed',
    });

    expect(patch).toEqual(expect.objectContaining({
      status: 'cancelled',
      error: null,
    }));
  });

  test('selects the latest submitted review state', () => {
    const state = selectLatestReviewState([
      { state: 'APPROVED', submitted_at: '2026-06-06T18:00:00.000Z', user: { login: 'first' } },
      { state: 'CHANGES_REQUESTED', submitted_at: '2026-06-06T19:00:00.000Z', user: { login: 'second' } },
    ]);

    expect(state).toEqual({
      state: 'CHANGES_REQUESTED',
      author: 'second',
      submittedAt: '2026-06-06T19:00:00.000Z',
    });
  });

  test('PR steward accepts exact and directory-scoped contract files', () => {
    expect(evaluatePrFilesAgainstContract({
      changedFiles: ['src/components/WeatherWindow.jsx', 'tests/weather.test.jsx'],
      contractFiles: ['src/components/WeatherWindow.jsx', 'tests/'],
    })).toEqual(expect.objectContaining({ ok: true }));
  });

  test('PR steward rejects files outside the todo contract', () => {
    const result = evaluatePrFilesAgainstContract({
      changedFiles: ['src/components/WeatherWindow.jsx', 'server/routes/chat.js'],
      contractFiles: ['src/components/WeatherWindow.jsx'],
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      outsideFiles: ['server/routes/chat.js'],
    }));
  });

  test('linked todo steward reports contract violations for changed PR files', async () => {
    const db = {
      async query() {
        return {
          rows: [{
            id: 'todo-1',
            data: {
              handoffTaskId: 'task-1',
              contractFiles: ['src/components/WeatherWindow.jsx'],
              contractForbidden: ['server/routes/chat.js'],
            },
          }],
        };
      },
    };

    const result = await checkLinkedTodoPrContract(db, 'task-1', [
      'src/components/WeatherWindow.jsx',
      'server/routes/chat.js',
    ]);

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      artifactId: 'todo-1',
    }));
    expect(result.message).toContain('Forbidden files: server/routes/chat.js');
  });
});
