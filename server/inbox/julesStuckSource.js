// Jules tasks the overnight runner gave up on (Alex's diagram 01: "page
// someone"). When scripts/jules-overnight.mjs parks a task, for example after
// three fix rounds where the review still says no, it lands in the queue's
// blocked list; this source puts each one in the Inbox under "Needs you".
// Owner only, and only where the app can read its own files, like the queue.

import { registerInboxSource } from './sources.js';

const WHY = {
  review_still_failing: 'The review still says no after 3 fix rounds.',
  terminal_without_pr: 'Jules finished without opening a pull request.',
  brief_missing: 'Its task file is missing.',
};

let reader = async () => (await import('../julesQueue.js')).readJulesQueue(process.env.JULES_QUEUE_PATH);
export function setJulesQueueReader(fn) { reader = fn; }

/** One blocked queue entry as an Inbox report. */
export function julesStuckReport(entry, repo = '') {
  const at = entry.blockedAt || new Date().toISOString();
  const pr = entry.prNumber ? ` Pull request #${entry.prNumber} is waiting.` : '';
  const why = WHY[entry.code] && !String(entry.detail || '').startsWith(WHY[entry.code].slice(0, 20)) ? `${WHY[entry.code]} ` : '';
  return {
    id: `${entry.brief || entry.title}|${at}`,
    title: `Jules is stuck: ${entry.title || 'a task'}`,
    detail: `${why}${entry.detail || 'The overnight runner stopped on it.'}${pr} It needs a person; the Jules Tasks window has the details.`.trim(),
    count: 1,
    lastHour: null,
    firstSeen: at,
    lastSeen: at,
    repo: repo || 'Jules',
    fixable: false,
  };
}

export function registerJulesStuckSource() {
  return registerInboxSource('jules-stuck', {
    async list({ isOwner, localFiles }) {
      if (!isOwner || !localFiles) return [];
      let queue;
      try {
        queue = await reader();
      } catch (err) {
        if (err?.code === 'ENOENT') return []; // no overnight queue on this computer
        throw err;
      }
      return (queue?.blocked || []).map((entry) => julesStuckReport(entry, queue.repo));
    },
  });
}
