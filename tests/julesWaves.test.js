import { describe, expect, it } from '@jest/globals';
import { briefWave, buildWaves, pickWaveDispatch, taskStage, waveNumber, waveSummary } from '../src/lib/jules/waves.js';
import { classifyHandoff } from '../server/julesQueueDiscovery.js';

const task = (brief, wave, extra = {}) => ({ brief: `.team/handoffs/${brief}.md`, title: brief, wave, ...extra });

describe('wave numbers (diagram 01)', () => {
  it('reads a Wave: line from a brief, or a W2-T3 tag in a title', () => {
    expect(briefWave('# Fix the dock\nWave: 2\nProject: CensaiHub')).toBe(2);
    expect(briefWave('# No wave here')).toBeNull();
    expect(waveNumber({ title: '[W3-T1] Dock fix' })).toBe(3);
    expect(waveNumber({ wave: 1, title: 'W3-T1' })).toBe(1);
    expect(waveNumber({ brief: 'plain.md' })).toBeNull();
  });

  it('discovery carries the wave from the brief', () => {
    const entry = classifyHandoff({
      filePath: '/repo/.team/handoffs/a.md',
      text: '# A\nStatus: open\nWave: 1\nProject: CensaiHub\n## Work\nDo it.',
      stat: { mtime: new Date('2026-10-16T00:00:00Z') },
      repoRoot: '/repo',
    });
    expect(entry.wave).toBe(1);
  });
});

describe('task stages', () => {
  it('follows a task from waiting to merged', () => {
    expect(taskStage({}, 'pending')).toBe('waiting');
    expect(taskStage({ dispatchable: false }, 'pending')).toBe('needs-split');
    expect(taskStage({ session: 's1' }, 'inflight')).toBe('with-jules');
    expect(taskStage({ prNumber: 4, checkState: 'green' }, 'inflight')).toBe('in-review');
    expect(taskStage({ prNumber: 4, checkState: 'red' }, 'inflight')).toBe('fixing');
    expect(taskStage({ code: 'review_failed' }, 'blocked')).toBe('needs-fix');
    expect(taskStage({ status: 'merged' }, 'dispatched')).toBe('merged');
  });
});

describe('waves and the gate', () => {
  const queue = {
    dispatched: [task('a', 1, { status: 'merged' }), task('b', 1, { status: 'merged' })],
    inflight: [task('c', 1, { prNumber: 12, checkState: 'pending' })],
    blocked: [],
  };
  const pending = [task('e', 2), task('d', 1), task('loose', null)];

  it('groups tasks into labelled waves and locks the next wave', () => {
    const { waves, current } = buildWaves({ ...queue, pending });
    expect(current).toBe(1);
    expect(waves.map((w) => [w.number, w.state, w.tasks.map((t) => t.label)])).toEqual([
      [1, 'running', ['W1-T1', 'W1-T2', 'W1-T3', 'W1-T4']],
      [2, 'locked', ['W2-T1']],
    ]);
    expect(waveSummary(waves[0])).toBe('Wave 1: 2 of 4 merged, 2 still going.');
    expect(waveSummary(waves[1])).toBe('Wave 2: starts when wave 1 is all merged.');
  });

  it('sends the rest of wave 1 before anything from wave 2', () => {
    const pick = pickWaveDispatch(pending, queue);
    expect(pending[pick.index].title).toBe('d');
  });

  it('holds wave 2 while a wave 1 PR is stuck, and says which', () => {
    const stuck = { ...queue, inflight: [], blocked: [task('c', 1, { code: 'review_failed' })] };
    const pick = pickWaveDispatch([task('e', 2)], stuck);
    expect(pick.index).toBe(-1);
    expect(pick.reason).toBe('Wave 1: W1-T3 needs a fix before wave 2 can start.');
  });

  it('opens wave 2 once wave 1 is all merged', () => {
    const done = { dispatched: ['a', 'b', 'c', 'd'].map((n) => task(n, 1, { status: 'merged' })) };
    const pick = pickWaveDispatch([task('loose', null), task('e', 2)], done);
    expect(pick.index).toBe(1);
  });

  it('sends tasks with no wave as before once every wave is merged', () => {
    expect(pickWaveDispatch([task('loose', null)], {}).index).toBe(0);
    expect(pickWaveDispatch([{ brief: 'x.md', dispatchable: false }], {}).index).toBe(-1);
  });
});
