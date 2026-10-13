import {
  COLLABORATION_EPISODE_LIMITS,
  deriveCollaborationEpisodes,
  formatCollaborationEpisodes,
} from '../server/collaboration/episodePolicy.js';

const human = { kind: 'user', id: '7', label: 'Member 7' };

test('ignores top-level workspace churn with no meaningful window delta', () => {
  const win = { id: 'doc', kind: 'doc', fileName: 'Plan.md', text: 'same', x: 1, y: 2 };
  expect(deriveCollaborationEpisodes(
    { wins: [win], focusMode: false, updatedAt: 'before' },
    { wins: [win], focusMode: true, updatedAt: 'after' },
    { actor: human, revision: 2 }
  )).toEqual([]);
});

test('derives deterministic actor, action, window, revision, and bounded edit facts', () => {
  const before = { wins: [
    { id: 'doc', kind: 'doc', fileName: 'Plan.md', text: 'Opening', x: 1, y: 2 },
    { id: 'old', kind: 'doc', fileName: 'Old.md', text: '', x: 0, y: 0 },
  ] };
  const after = { wins: [
    { id: 'doc', kind: 'doc', fileName: 'Launch.md', text: 'Opening\nShip it', x: 9, y: 10 },
    { id: 'new', kind: 'code_editor', title: 'Probe', code: '', x: 3, y: 4 },
  ] };
  const episodes = deriveCollaborationEpisodes(before, after, { actor: human, revision: 4 });
  expect(episodes.map(item => item.action)).toEqual([
    'renamed', 'moved', 'edited', 'added', 'removed',
  ]);
  expect(episodes[2]).toMatchObject({
    eventType: 'collaboration.window.edited', revision: 4,
    actorLabel: 'Member 7', windowId: 'doc',
    detail: { mode: 'appended', excerpt: 'Ship it' },
  });
  expect(formatCollaborationEpisodes([episodes[2]])).toContain(
    '[revision 4] Member 7 appended content in Launch.md: Ship it'
  );
});

test('makes bulk loss and excerpt loss explicit and bounded', () => {
  const bulk = deriveCollaborationEpisodes({ wins: [] }, {
    wins: Array.from({ length: 24 }, (_, index) => ({ id: `w-${index}`, kind: 'doc' })),
  }, { actor: human, revision: 1 });
  expect(bulk).toHaveLength(COLLABORATION_EPISODE_LIMITS.maxEpisodesPerCommit);

  const long = deriveCollaborationEpisodes(
    { wins: [{ id: 'doc', kind: 'doc', text: '' }] },
    { wins: [{ id: 'doc', kind: 'doc', text: 'x'.repeat(500) }] },
    { actor: human, revision: 2 }
  );
  expect(long[0].detail.excerpt).toHaveLength(COLLABORATION_EPISODE_LIMITS.maxExcerptChars);
  expect(JSON.stringify(long)).not.toContain('x'.repeat(201));
});

test('samples tiny append bursts at deterministic checkpoints', () => {
  let previous = { wins: [{ id: 'doc', kind: 'doc', text: '' }] };
  const episodes = [];
  for (let revision = 1; revision <= 40; revision += 1) {
    const next = { wins: [{ id: 'doc', kind: 'doc', text: 'x'.repeat(revision) }] };
    episodes.push(...deriveCollaborationEpisodes(previous, next, { actor: human, revision }));
    previous = next;
  }
  expect(episodes).toHaveLength(1);
  expect(episodes[0]).toMatchObject({
    revision: 40,
    detail: { mode: 'appended', resultChars: 40, excerpt: 'x'.repeat(40) },
  });
  expect(deriveCollaborationEpisodes(
    previous,
    { wins: [{ id: 'doc', kind: 'doc', text: `${'x'.repeat(40)}important.` }] },
    { actor: human, revision: 41 }
  )).toHaveLength(1);
});
