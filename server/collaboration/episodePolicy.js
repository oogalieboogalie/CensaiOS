const TEXT_FIELDS = Object.freeze({ doc: 'text', code_editor: 'code' });
const MAX_EPISODES_PER_COMMIT = 16;
const MAX_EXCERPT_CHARS = 200;
const MIN_APPEND_CHARS = 12;
const APPEND_CHECKPOINT_CHARS = 40;

function windowsById(value) {
  const wins = Array.isArray(value?.wins) ? value.wins : [];
  return new Map(wins.filter(win => win?.id).map(win => [String(win.id), win]));
}

function windowLabel(win) {
  return String(win?.fileName || win?.title || win?.kind || 'Window').trim().slice(0, 128);
}

function cleanExcerpt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS);
}

function position(win) {
  return Number.isFinite(win?.x) && Number.isFinite(win?.y) ? { x: win.x, y: win.y } : null;
}

function samePosition(left, right) {
  return left?.x === right?.x && left?.y === right?.y;
}

function editDetail(before, after, field) {
  const prior = String(before?.[field] || '');
  const next = String(after?.[field] || '');
  if (prior === next) return null;
  if (next.startsWith(prior)) {
    const appended = next.slice(prior.length);
    const checkpoint = Math.floor(prior.length / APPEND_CHECKPOINT_CHARS)
      < Math.floor(next.length / APPEND_CHECKPOINT_CHARS);
    const significant = appended.length >= MIN_APPEND_CHARS || /[\n.!?]/.test(appended) || checkpoint;
    if (!significant) return null;
    const excerpt = checkpoint && appended.length < MIN_APPEND_CHARS
      ? next.slice(-APPEND_CHECKPOINT_CHARS) : appended;
    return {
      mode: 'appended', deltaChars: appended.length, resultChars: next.length,
      excerpt: cleanExcerpt(excerpt),
    };
  }
  if (prior.startsWith(next)) {
    return { mode: 'truncated', deltaChars: next.length - prior.length, resultChars: next.length, excerpt: '' };
  }
  return {
    mode: 'replaced', deltaChars: next.length - prior.length, resultChars: next.length,
    excerpt: cleanExcerpt(next),
  };
}

function baseEpisode({ actor, revision, win, action }) {
  return {
    eventType: `collaboration.window.${action}`,
    action,
    revision,
    windowId: String(win.id),
    windowKind: String(win.kind || 'unknown'),
    windowLabel: windowLabel(win),
    actorLabel: String(actor?.label || `${actor?.kind || actor?.type || 'actor'} ${actor?.id || ''}`).trim(),
  };
}

function summarize(episode) {
  const who = episode.actorLabel;
  const label = episode.windowLabel;
  if (episode.action === 'added') return `${who} opened ${label}`;
  if (episode.action === 'removed') return `${who} removed ${label}`;
  if (episode.action === 'renamed') return `${who} renamed ${episode.detail.from} to ${episode.detail.to}`;
  if (episode.action === 'moved') {
    return `${who} moved ${label} to (${episode.detail.to.x}, ${episode.detail.to.y})`;
  }
  const excerpt = episode.detail.excerpt ? `: ${episode.detail.excerpt}` : '';
  return `${who} ${episode.detail.mode} content in ${label}${excerpt}`;
}

export function deriveCollaborationEpisodes(previousValue, nextValue, {
  actor, revision,
} = {}) {
  if (!actor?.id || !Number.isSafeInteger(revision) || revision < 1) return [];
  const before = windowsById(previousValue);
  const after = windowsById(nextValue);
  const episodes = [];
  const add = (episode) => {
    if (episodes.length >= MAX_EPISODES_PER_COMMIT) return;
    episodes.push({ ...episode, summary: summarize(episode) });
  };

  for (const [id, win] of after) {
    const prior = before.get(id);
    if (!prior) {
      const episode = baseEpisode({ actor, revision, win, action: 'added' });
      episode.detail = { to: position(win) };
      add(episode);
      continue;
    }
    const oldLabel = windowLabel(prior);
    const newLabel = windowLabel(win);
    if (oldLabel !== newLabel) {
      const episode = baseEpisode({ actor, revision, win, action: 'renamed' });
      episode.detail = { from: oldLabel, to: newLabel };
      add(episode);
    }
    const from = position(prior);
    const to = position(win);
    if (from && to && !samePosition(from, to)) {
      const episode = baseEpisode({ actor, revision, win, action: 'moved' });
      episode.detail = { from, to };
      add(episode);
    }
    const field = TEXT_FIELDS[win.kind];
    const detail = field ? editDetail(prior, win, field) : null;
    if (detail) {
      const episode = baseEpisode({ actor, revision, win, action: 'edited' });
      episode.detail = { field, ...detail };
      add(episode);
    }
  }

  for (const [id, win] of before) {
    if (after.has(id)) continue;
    const episode = baseEpisode({ actor, revision, win, action: 'removed' });
    episode.detail = {};
    add(episode);
  }
  return episodes;
}

export function formatCollaborationEpisodes(episodes) {
  if (!episodes?.length) return '';
  return ['Recent collaboration memory (newest first):',
    ...episodes.map(episode => `• [revision ${episode.revision}] ${episode.summary}`),
  ].join('\n');
}

export const COLLABORATION_EPISODE_LIMITS = Object.freeze({
  maxEpisodesPerCommit: MAX_EPISODES_PER_COMMIT,
  maxExcerptChars: MAX_EXCERPT_CHARS,
  minAppendChars: MIN_APPEND_CHARS,
  appendCheckpointChars: APPEND_CHECKPOINT_CHARS,
});
