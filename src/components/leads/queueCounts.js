import { logToApp } from '../../lib/appLog/browserLog.js';

const STATUSES = ['new', 'contacted', 'qualified', 'dead'];

function emptyCounts() {
  return { all: 0, new: 0, contacted: 0, qualified: 0, dead: 0 };
}

function fromLeads(leads) {
  const counts = emptyCounts();
  const list = Array.isArray(leads) ? leads : [];
  counts.all = list.length;
  for (const lead of list) {
    if (STATUSES.includes(lead.status)) counts[lead.status] += 1;
  }
  return counts;
}

/**
 * Button counts for every lead on the board. The list payload's counts win,
 * because the rows themselves may be only the status the user picked.
 */
export function queueCountsFromPayload(counts, leads) {
  if (!counts || typeof counts !== 'object') return fromLeads(leads);
  const out = emptyCounts();
  for (const key of STATUSES) out[key] = Number(counts[key]) || 0;
  const all = Number(counts.all);
  out.all = Number.isFinite(all) ? all : out.new + out.contacted + out.qualified + out.dead;
  return out;
}

/** Move one lead from one status bucket to another. The board total stays put. */
export function shiftQueueCount(counts, from, to) {
  const next = { ...emptyCounts(), ...counts };
  if (STATUSES.includes(from)) next[from] = Math.max(0, (Number(next[from]) || 0) - 1);
  if (STATUSES.includes(to)) next[to] = (Number(next[to]) || 0) + 1;
  return next;
}

/** One line for a list load: the filter and how many rows came back. No contact details. */
export function noteLeadList(filter, count) {
  logToApp('info', `lead queue: filter ${filter || 'all'}, ${Number(count) || 0} shown`, { where: 'leads' });
}
