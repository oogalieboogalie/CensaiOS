// Page a person when Jules gets stuck (diagram 01): every task the
// overnight runner parks shows up in the Inbox under "Needs you", for the
// owner only.
import { julesStuckReport, registerJulesStuckSource, setJulesQueueReader } from '../server/inbox/julesStuckSource.js';
import { listReports, resetInboxSources } from '../server/inbox/sources.js';
import { buildInbox } from '../server/inbox/collect.js';

const parked = {
  title: 'W1-T3 Opening hours', brief: 'handoff/hours.md', prNumber: 809, code: 'review_still_failing',
  detail: 'The review still says no after 3 fix rounds: ChatGPT review found 1 high-severity bug.', blockedAt: '2026-10-16T03:10:00Z',
};

afterEach(() => resetInboxSources());

describe('Jules stuck in the Inbox', () => {
  test('a parked task reads as a plain "needs you" line with its pull request', () => {
    const report = julesStuckReport(parked, 'demo/bakery');
    expect(report.title).toBe('Jules is stuck: W1-T3 Opening hours');
    expect(report.detail).toBe('The review still says no after 3 fix rounds: ChatGPT review found 1 high-severity bug. Pull request #809 is waiting. It needs a person; the Jules Tasks window has the details.');
    expect(julesStuckReport({ title: 'Logo', code: 'terminal_without_pr', detail: 'Jules ended in FAILED without opening a PR.' }).detail).toMatch(/^Jules finished without opening a pull request\. Jules ended/);
  });

  test('the owner sees parked tasks under Needs you; others and a missing queue see nothing', async () => {
    setJulesQueueReader(async () => ({ repo: 'demo/bakery', blocked: [parked] }));
    registerJulesStuckSource();
    const { reports } = await listReports({ isOwner: true, localFiles: true });
    const [item] = buildInbox({ reports }).items;
    expect(item).toMatchObject({ title: 'Jules is stuck: W1-T3 Opening hours', group: 'needs', repo: 'demo/bakery', fixable: false });
    expect((await listReports({ isOwner: false, localFiles: true })).reports).toEqual([]);
    setJulesQueueReader(async () => { throw Object.assign(new Error('no file'), { code: 'ENOENT' }); });
    expect(await listReports({ isOwner: true, localFiles: true })).toEqual({ reports: [], sourceErrors: {} });
  });
});
