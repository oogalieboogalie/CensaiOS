// A Kraken Request starts as a pasted report (server/kraken/parse.js) and
// becomes arms, one finding each, for the family (server/kraken/arms.js).
// The report here is made up: a review of the Testco shop project.
import { MAX_FINDINGS, ReportInputError, parseReport } from '../server/kraken/parse.js';
import { buildArms, pickAgent, planInput, publicRequest, asWriteup } from '../server/kraken/arms.js';
import { normalizePlanInput } from '../server/censaiOrchestrator/shape.js';

const REPORT = `# Review of the Testco shop

Some words before the findings that are not a finding.

## Failing now
- **P0** - Checkout crashes when the cart is empty
  The total is read before the cart loads, in \`src/cart/total.js:14\`.
  Done when: an empty cart shows "Your cart is empty"
  Done when: no error in the log

## Will fail
### P1: Orders table has no index on customer id
Every order page runs a full scan of the table.
Owner: Nexus

- [P2] Two date libraries do the same job

## Notes
- High memory use was not looked at.
`;

describe('reading a report', () => {
  test('only the lines that say how bad they are become findings, in order', () => {
    const { title, findings, dropped } = parseReport(REPORT);
    expect(title).toBe('Review of the Testco shop');
    expect(dropped).toBe(0);
    expect(findings.map((f) => [f.n, f.severity, f.title])).toEqual([
      [1, 'P0', 'Checkout crashes when the cart is empty'],
      [2, 'P1', 'Orders table has no index on customer id'],
      [3, 'P2', 'Two date libraries do the same job'],
    ]);
  });

  test('detail, owner, checklist and files come from the lines under a finding', () => {
    const [crash, index] = parseReport(REPORT).findings;
    expect(crash.body).toContain('The total is read before the cart loads');
    expect(crash.body).not.toContain('Done when');
    expect(crash.doneWhen).toEqual(['an empty cart shows "Your cart is empty"', 'no error in the log']);
    expect(crash.files).toEqual(['src/cart/total.js']);
    expect(index.owner).toBe('Nexus');
    expect(index.body).toBe('Every order page runs a full scan of the table.');
  });

  test('a report with no ranks: every top-level item is a finding, ranked by its section', () => {
    const { findings } = parseReport('## Broken\n- Login page is blank\n  - seen on phones\n\n## Clean-up\n- Old logs pile up\n\n## Other\n- Rename the folder');
    expect(findings.map((f) => [f.severity, f.title])).toEqual([
      ['P0', 'Login page is blank'], ['P2', 'Old logs pile up'], ['P2', 'Rename the folder'],
    ]);
    expect(findings[0].body).toContain('seen on phones');
  });

  test('words such as High, Critical and Low count as ranks only with a mark after them', () => {
    const { findings } = parseReport('- Critical: the backup never runs\n- [High] sessions never end\n- Low - old icons\n- High memory use is fine');
    expect(findings.map((f) => f.severity)).toEqual(['P0', 'P1', 'P2']);
  });

  test('a section heading with a rank ranks what is under it and is never a finding itself', () => {
    const bare = parseReport('## P0\n- Checkout crashes\n- Login fails\n## P1\n- No index');
    expect(bare.findings.map((f) => [f.severity, f.title])).toEqual([['P0', 'Checkout crashes'], ['P0', 'Login fails'], ['P1', 'No index']]);
    const named = parseReport('P0: 2, P1: 1\n\n## P0 - Broken now\n- Checkout crashes\n## P1 - Will break\n- No index');
    expect(named.findings.map((f) => [f.severity, f.title])).toEqual([['P0', 'Checkout crashes'], ['P1', 'No index']]);
  });

  test('smaller headings under a finding are part of its detail', () => {
    const { findings } = parseReport('### P0: Checkout crashes\nIt throws.\n#### Evidence\nSeen in `src/cart/total.js`.\n#### Fix\nDone when: an empty cart shows a message\n### P1: No index\nSlow.');
    expect(findings).toHaveLength(2);
    expect(findings[0].files).toEqual(['src/cart/total.js']);
    expect(findings[0].doneWhen).toEqual(['an empty cart shows a message']);
  });

  test('a long report with an unclosed backtick is still read quickly', () => {
    const started = Date.now();
    parseReport(`- P0 - x\n\`${'a/'.repeat(29_000)}`);
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('nothing to hand out, an empty report and one that is too long are refused in plain words', () => {
    expect(() => parseReport('')).toThrow(ReportInputError);
    expect(() => parseReport('Just a paragraph of thoughts.')).toThrow(/could not find anything to hand out/);
    expect(() => parseReport('x'.repeat(60_001))).toThrow(/too long/);
  });

  test('findings past the limit are counted, not handed out', () => {
    const many = Array.from({ length: MAX_FINDINGS + 3 }, (_, i) => `- P2 - thing ${i + 1}`).join('\n');
    const { findings, dropped } = parseReport(many);
    expect(findings).toHaveLength(MAX_FINDINGS);
    expect(dropped).toBe(3);
  });
});

describe('arms', () => {
  const { findings } = parseReport(REPORT);

  test('the named owner wins; otherwise the words of the finding pick who fits', () => {
    expect(pickAgent(findings[1])).toBe('nexus');
    expect(pickAgent({ title: 'Docker compose restarts the container in a loop', body: '' })).toBe('foundation');
    expect(pickAgent({ title: 'The window header overlaps on a small canvas', body: 'css' })).toBe('genesis');
    expect(pickAgent({ title: 'The api route has no timeout', body: 'server' })).toBe('atlas');
    expect(pickAgent({ title: 'Something vague', body: '' })).toBe('architect');
    expect(pickAgent({ title: 'x', body: '', owner: 'Nobody Real' })).toBe('architect');
  });

  test('a write-up changes nothing: every arm is an answer job Censai can hand off', () => {
    const arms = buildArms(findings, { mode: 'writeup' });
    expect(arms.map((arm) => [arm.severity, arm.kind, arm.status])).toEqual([
      ['P0', 'answer', 'waiting'], ['P1', 'answer', 'waiting'], ['P2', 'answer', 'waiting'],
    ]);
    // What the report says done looks like goes along as the target; a write-up is checked as a write-up.
    expect(arms[0].task).toContain('The fix counts as done when: an empty cart shows "Your cart is empty"; no error in the log');
    expect(arms[0].checklist).toHaveLength(3);
    expect(arms[1].task).toContain('Do not change any files.');
    for (const arm of arms) {
      const plan = normalizePlanInput(planInput({ project: null }, arm));
      expect(plan.jobs).toHaveLength(1);
      expect(plan.jobs[0].agentId).toBe(arm.agentId);
      expect(plan.goal).toMatch(/^Kraken P[0-2]: /);
    }
  });

  test('a fix is code work only with a project and an agent who can change files, and falls back to a write-up', () => {
    const [arm] = buildArms([{ n: 1, severity: 'P0', title: 'The api route has no timeout', body: 'server', doneWhen: [], files: [] }], { mode: 'fix', project: 'testco-shop' });
    expect(arm.kind).toBe('code');
    const [own] = buildArms([{ n: 1, severity: 'P0', title: 'The api route has no timeout', body: 'server', doneWhen: ['a slow call ends after 10 seconds'], files: [] }], { mode: 'fix', project: 'testco-shop' });
    expect(own.checklist).toEqual(['a slow call ends after 10 seconds']);
    expect(normalizePlanInput(planInput({ project: 'testco-shop' }, arm)).jobs[0].kind).toBe('code');
    expect(buildArms(findings, { mode: 'fix', project: null }).every((item) => item.kind === 'answer')).toBe(true);
    asWriteup(arm, 'Project Writer is not equipped on Atlas.');
    expect([arm.kind, arm.note]).toEqual(['answer', 'Project Writer is not equipped on Atlas.']);
    expect(arm.task).toContain('Do not change any files.');
  });

  test('only keeps the picked findings, worst first', () => {
    expect(buildArms(findings, { only: [3, 1] }).map((arm) => arm.n)).toEqual([1, 3]);
  });

  test('what the browser gets has no task text, only who, what and how far', () => {
    const arms = buildArms(findings, {});
    arms[0].status = 'done';
    const shown = publicRequest({ id: 'r1', title: 'Review', mode: 'writeup', status: 'open', arms, created_at: '2026-11-01T10:00:00Z' });
    expect(shown.counts).toEqual({ waiting: 2, handed: 0, done: 1, stuck: 0, stopped: 0 });
    expect(shown.arms[0]).toEqual(expect.objectContaining({ n: 1, agent: expect.any(String), status: 'done' }));
    expect(shown.arms[0].task).toBeUndefined();
  });
});
