// ═══════════════════════════════════════════════════════════════════
//  INBOX SOURCES
//  The hook for anything else that wants a line in the Inbox, first of
//  all the self-fixing error reports. A source registers once at boot:
//
//    registerInboxSource('error-reports', {
//      list: async ({ userId }) => [ { id, title, detail, count, lastHour,
//                                      firstSeen, lastSeen, users, fixable,
//                                      fixing } ],
//      fix:  async ({ userId, user, reportId }) => ({ text }),   // optional
//    });
//
//  Each report becomes an item through errorItem() (src/lib/inbox).
//  A source that throws is skipped and named in `sourceErrors`, so one
//  broken source never empties the Inbox.
// ═══════════════════════════════════════════════════════════════════

const sources = new Map();

export function registerInboxSource(id, source) {
  if (!id || typeof source?.list !== 'function') throw new Error('An inbox source needs an id and a list() function.');
  sources.set(String(id), source);
  return () => sources.delete(String(id));
}

export function inboxSources() {
  return [...sources.keys()];
}

/** Every report from every source, each tagged with where it came from. */
export async function listReports(ctx = {}) {
  const reports = [];
  const sourceErrors = {};
  await Promise.all([...sources.entries()].map(async ([id, source]) => {
    try {
      const list = await source.list(ctx);
      for (const r of Array.isArray(list) ? list : []) {
        reports.push({ ...r, source: id, fixable: Boolean(r.fixable && source.fix) });
      }
    } catch (err) {
      sourceErrors[id] = err?.message || 'failed';
    }
  }));
  return { reports, sourceErrors };
}

export async function fixReport(sourceId, ctx) {
  const source = sources.get(String(sourceId || ''));
  if (!source?.fix) throw Object.assign(new Error('That report cannot be fixed from here.'), { status: 404 });
  return source.fix(ctx);
}

/** Test helper. */
export function resetInboxSources() {
  sources.clear();
}
