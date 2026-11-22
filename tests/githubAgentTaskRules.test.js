// The rules a coding job is followed by, with no database and no GitHub:
// which pull request is a job's (server/github/taskMarker.js,
// agentTaskFacts.js), what counts as a review (agentTaskReview.js) and when a
// job is proven done (agentTaskProgress.js).
const { taskMarker, taskKeysIn, alreadyFixedMarker, alreadyFixedIn } = await import('../server/github/taskMarker.js');
const { pullFacts, pullClaim, pullIsFor, pullPatch, checkFact, checkPatch } = await import('../server/github/agentTaskFacts.js');
const { reviewFact, commentPatch, alreadyFixedPatch } = await import('../server/github/agentTaskReview.js');
const { taskProgress } = await import('../server/github/agentTaskProgress.js');

const REPO = 'pat-example/made-up-repo';
const KEY = '11111111-2222-4333-8444-555555555555';
const OTHER_KEY = '99999999-2222-4333-8444-555555555555';
const A = 'a1'.repeat(20);
const B = 'b2'.repeat(20);
const M = 'c3'.repeat(20);
const a7 = A.slice(0, 7);
const CTO = '\u2014 CTO';
const MARK = taskMarker(KEY);
const cleanWords = (sha) => `Independent bug review on head ${sha.slice(0, 7)}: clean. Read every changed file. Safe to merge.\n\n${CTO}`;
const job = (more) => ({ id: '7', task_key: KEY, repo: REPO, issue_number: 17, worker: 'claude', status: 'open', pr_number: null, created_at: '2026-11-01T00:00:00Z', checks_detail: {}, ...more });
const pull = ({ body = MARK, ref = 'claude/wave-fixture', from = REPO, created = '2026-11-10T00:00:00Z', number = 77, sha = A } = {}) => pullFacts({
  number, html_url: 'u77', body, state: 'open', created_at: created, changed_files: 3, head: { ref, sha, repo: { full_name: from } },
}, { repo: REPO });

describe('the line that ties a pull request to its job', () => {
  test('is one format, and only counts on a line of its own outside code', () => {
    expect(MARK).toBe(`<!-- censai-task: ${KEY} -->`);
    expect(taskKeysIn(`intro\n${MARK}\n  ${taskMarker(OTHER_KEY)}  \n${MARK}`)).toEqual([KEY, OTHER_KEY]);
    const explained = [
      `The worker copies \`${MARK}\` into the description.`,
      `> ${MARK}`,
      `    ${MARK}`,
      '```', MARK, '```',
      '~~~~md', MARK, '~~~~',
      '<!-- censai-task: 12 -->',
      'Task: 12, fixes #12',
    ].join('\n');
    expect(taskKeysIn(explained)).toEqual([]);
    expect(alreadyFixedIn(`${alreadyFixedMarker(KEY, A.toUpperCase())}\n\`${alreadyFixedMarker(OTHER_KEY, B)}\``)).toEqual([{ taskKey: KEY, sha: A }]);
    expect(() => taskMarker('12')).toThrow();
  });

  test('code fences follow CommonMark, and a <pre> block is code too', () => {
    const other = taskMarker(OTHER_KEY);
    // A line like ```js inside a block opens nothing and closes nothing: the block goes on.
    expect(taskKeysIn(['```', 'example:', '```js', other, '```', MARK].join('\n'))).toEqual([KEY]);
    // A closing fence is the same character, at least as long, with nothing after it.
    expect(taskKeysIn(['````', '```', other, '~~~~', '```` not closed', other, '````', MARK].join('\n'))).toEqual([KEY]);
    // Inline code that starts a line with three backticks is not a fence, so the marker below it counts.
    expect(taskKeysIn(['```inline``` code on one line', MARK].join('\n'))).toEqual([KEY]);
    // An HTML <pre> block is code, on one line or several.
    expect(taskKeysIn(['<pre>', other, '</pre>', `<pre>${other}</pre>`, '<PRE class="x">', other, 'end </pre>', MARK].join('\n'))).toEqual([KEY]);
    // A fence never closed runs to the end, as GitHub shows it: what follows is code.
    expect(taskKeysIn(['```', other].join('\n'))).toEqual([]);
  });

  test('a claude/wave-fixture pull request carrying the job\'s own key is that job\'s', () => {
    expect(pullIsFor(job(), pull())).toBe(true);
    expect(pullClaim(pull())).toEqual({ worker: 'claude', taskKeys: [KEY], issueNumber: null });
    // The old branch form still works without a line.
    expect(pullIsFor(job(), pull({ body: '', ref: 'claude/issue-17-switch' }))).toBe(true);
  });

  test('a job number from another install, a reset database, or an example of the format ties nothing', () => {
    // Same row number 7 and the same repository, but each job has its own key.
    expect(pullIsFor(job({ task_key: OTHER_KEY }), pull())).toBe(false);
    expect(pullIsFor(job({ task_key: null }), pull())).toBe(false);
    expect(pullIsFor(job(), pull({ body: '<!-- censai-task: 7 -->' }))).toBe(false);
    expect(pullIsFor(job(), pull({ body: `The format is \`${MARK}\`:\n\n\`\`\`\n${MARK}\n\`\`\`` }))).toBe(false);
  });

  test('nor does Fixes #17, another worker\'s branch, an ordinary branch, a fork, or a pull request older than the job', () => {
    expect(pullIsFor(job(), pull({ body: 'Fixes #17' }))).toBe(false);
    expect(pullIsFor(job(), pull({ ref: 'grok/wave-fixture' }))).toBe(false);
    expect(pullIsFor(job(), pull({ ref: 'feature/wave-fixture' }))).toBe(false);
    expect(pullIsFor(job(), pull({ from: 'someone-else/fork' }))).toBe(false);
    expect(pullIsFor(job(), pull({ created: '2026-10-01T00:00:00Z' }))).toBe(false);
    expect(pullIsFor(job(), pull({ body: '', ref: 'claude/issue-17-switch', created: '2026-10-01T00:00:00Z' }))).toBe(false);
    // A branch number too long to be an issue claims nothing.
    expect(pullClaim(pull({ body: '', ref: 'claude/issue-99999999999-x' })).issueNumber).toBeNull();
  });

  test('new commits reset what was known about the old one; a new check result asks for a fresh confirmation', () => {
    const linked = job({ status: 'pr_open', pr_number: 77, pr_head_sha: A, checks_sha: A, checks_detail: { 'run:ci': 'passed' }, checks_confirmed: 'passed', merge_bot_note: 'not merging yet' });
    expect(pullPatch(linked, pull({ sha: B }))).toMatchObject({ pr_head_sha: B, checks_sha: B, checks_detail: {}, checks_confirmed: null, merge_bot_note: null });
    const fact = checkFact('check_run', { check_run: { name: 'lint', head_sha: A, status: 'completed', conclusion: 'failure' } });
    expect(checkPatch(linked, fact)).toEqual({ checks_sha: A, checks_detail: { 'run:ci': 'passed', 'run:lint': 'failed' }, checks_confirmed: null });
    expect(checkFact('check_suite', { check_suite: { id: 5, head_sha: A, status: 'queued' } })).toBeNull();
  });
});

describe('what counts as a review', () => {
  const by = (body, who = 'OWNER') => reviewFact({ body, author_association: who }, A);

  test('only the house form that says the latest commit was clean passes', () => {
    expect(by(cleanWords(A))).toMatchObject({ state: 'approved', sha: A, kind: 'comment' });
    expect(by(`Independent bug review on head \`${a7}\`: clean. Checks are still running. It merges once CI is green.\n\n${CTO}\n`)).toMatchObject({ state: 'approved' });
    // Signed, names the commit, but does not say it was clean: reviewed, not passed.
    expect(by(`Review of head ${a7}: 2 real findings.\n1. The lock is dropped.\nDo not merge.\n\n${CTO}`)).toMatchObject({ state: 'not_clean', sha: A });
    // Signed and names a commit, but carries no verdict at all: neither passes nor blocks.
    expect(by(`Fixed the lock on ${a7}, reviewing the new head next.\n\n${CTO}`)).toBeNull();
    expect(by(`Independent bug review on head ${a7}: clean. Do not merge until the owner looks. Safe to merge.\n\n${CTO}`)).toMatchObject({ state: 'not_clean' });
    expect(by(`Independent bug review on head ${B.slice(0, 7)}: clean. Safe to merge. Later I also read ${a7}.\n\n${CTO}`)).toMatchObject({ state: 'not_clean', sha: A });
    // No commit named, or the signature is not the last line: not a review at all.
    expect(by(`Independent bug review: clean. Safe to merge.\n\n${CTO}`)).toBeNull();
    expect(by(`Independent bug review on head ${a7}: clean. Safe to merge. ${CTO} said so, and more after.`)).toBeNull();
  });

  test('the house form is read with "of" or "on" and with bold or italic words', () => {
    expect(by(`Independent bug review of head ${a7}: clean. Safe to merge.\n\n${CTO}`)).toMatchObject({ state: 'approved', sha: A });
    expect(by(`**Independent bug review on head ${a7}: clean.** Read it all. _Safe to merge._\n\n${CTO}`)).toMatchObject({ state: 'approved' });
    expect(by(`Independent bug review on head ${a7}: **clean**. Safe to merge.\n\n**${CTO}**`)).toMatchObject({ state: 'approved' });
    // The house form with findings is reviewed, not passed.
    expect(by(`Independent bug review on head ${a7}: two findings.\n1. The lock is dropped.\n\n${CTO}`)).toMatchObject({ state: 'not_clean' });
    expect(by(`Review of head ${a7}: 2 findings.\n\n${CTO}`)).toMatchObject({ state: 'not_clean' });
  });

  test('findings block and a clean review with none passes; struck-through words were taken back', () => {
    expect(by(`Independent bug review on head ${a7}: clean. 0 findings. Safe to merge.\n\n${CTO}`)).toMatchObject({ state: 'approved' });
    expect(by(`Independent bug review on head ${a7}: clean. The 2 findings from the last review are fixed. Safe to merge.\n\n${CTO}`)).toMatchObject({ state: 'approved' });
    // A numbered findings review without the house form or "do not merge" still blocks.
    expect(by(`Second look at ${a7}:\n1. crashes when the list is empty\n2. leaks the token\n\n${CTO}`)).toMatchObject({ state: 'not_clean' });
    // A not-clean review that mentions master is still not clean.
    expect(by(`Independent bug review on head ${a7}: not clean. 1. The bug from master still stands.\n\n${CTO}`)).toMatchObject({ state: 'not_clean' });
    expect(by(`~~Independent bug review on head ${a7}: clean. Safe to merge.~~\nFound a crash after all.\n\n${CTO}`)).toBeNull();
    // A quoted older "needs changes" is no verdict of its own.
    expect(by('> Needs changes: the old lock.\nThat is fixed now.')).toBeNull();
  });

  test('the "only master was brought in" line neither passes nor blocks, and so does not undo an earlier clean review', () => {
    const line = `Only master was brought in since the clean review of ${B.slice(0, 7)}; head ${a7}, the earlier review stands.\n\n${CTO}`;
    expect(by(line)).toBeNull();
    const said = (body, at) => ({ body, author_association: 'OWNER', created_at: at });
    const task = job({ status: 'pr_open', pr_number: 77, pr_head_sha: A, review_state: 'approved', review_sha: A, review_kind: 'comment', review_at: '2026-11-20T10:00:00Z' });
    expect(commentPatch(task, said(line, '2026-11-20T11:00:00Z'))).toBeNull();
    expect(commentPatch(task, said(`Fixed a typo on ${a7}.\n\n${CTO}`, '2026-11-20T11:00:00Z'))).toBeNull();
  });

  test('"needs changes" counts only as a verdict, and an unsigned one is about the commit current when it was written', () => {
    expect(by('Nothing else needs changes. Looks good.')).toBeNull();
    expect(by('This no longer needs changes.')).toBeNull();
    expect(by('Thanks!\n\n**Needs changes:** the retry loses the notice.')).toMatchObject({ state: 'changes_requested' });
    expect(by('- needs_changes')).toMatchObject({ state: 'changes_requested' });
    const said = (body, at) => ({ body, author_association: 'OWNER', created_at: at });
    // The latest commit was first seen at 12:00; a catch-up reads an unsigned verdict from 10:00.
    const task = job({ status: 'pr_open', pr_number: 77, pr_head_sha: A, pr_head_at: '2026-11-20T12:00:00Z' });
    expect(commentPatch(task, said('Needs changes: the old lock.', '2026-11-20T10:00:00Z'))).toBeNull();
    expect(commentPatch(task, said('Needs changes: the new lock.', '2026-11-20T12:30:00Z'))).toMatchObject({ review_state: 'changes_requested', review_sha: A });
    // One that names the commit it is about still counts for that commit.
    expect(commentPatch(task, said(`Needs changes on ${a7}.`, '2026-11-20T10:00:00Z'))).toMatchObject({ review_state: 'changes_requested', review_sha: A });
  });

  test('a member\'s "needs changes" blocks without a signature, as it does for the merge-bot', () => {
    expect(by('NEEDS CHANGES: the retry loses the notice.')).toMatchObject({ state: 'changes_requested', sha: A });
    expect(by(`Not cleared for ${B.slice(0, 8)} yet.`)).toMatchObject({ state: 'changes_requested', sha: B.slice(0, 8) });
    expect(by('Looks fine to me.')).toBeNull();
    expect(by('merge-bot: not merging yet, this PR needs changes.')).toBeNull();
  });

  test('only the owner or a member of the repository counts, not an invited outsider or a passer-by', () => {
    for (const who of ['COLLABORATOR', 'CONTRIBUTOR', 'NONE']) {
      expect(by(cleanWords(A), who)).toBeNull();
      expect(by('needs changes', who)).toBeNull();
      expect(reviewFact({ state: 'APPROVED', commit_id: A, author_association: who }, A)).toBeNull();
    }
    expect(reviewFact({ state: 'APPROVED', commit_id: A, author_association: 'MEMBER' }, A)).toMatchObject({ state: 'approved', kind: 'formal' });
  });

  test('the latest verdict on the latest commit wins', () => {
    const said = (body, at) => ({ body, author_association: 'OWNER', created_at: at });
    let task = job({ status: 'pr_open', pr_number: 77, pr_head_sha: A });
    const hear = (row) => { task = { ...task, ...commentPatch(task, row) }; };
    hear(said(`Review of head ${a7}: 2 real findings. Do not merge.\n\n${CTO}`, '2026-11-20T10:00:00Z'));
    expect(task).toMatchObject({ review_state: 'not_clean', review_sha: A });
    hear(said(cleanWords(A), '2026-11-20T11:00:00Z'));
    expect(task.review_state).toBe('approved');
    // A later word about an older commit does not replace the verdict on the latest one.
    hear(said(cleanWords(B), '2026-11-20T12:00:00Z'));
    expect(task).toMatchObject({ review_state: 'approved', review_sha: A });
    hear(said('Needs changes after all.', '2026-11-20T13:00:00Z'));
    expect(task.review_state).toBe('changes_requested');
    // An earlier comment arriving late does not undo it.
    expect(commentPatch(task, said(cleanWords(A), '2026-11-20T11:30:00Z'))).toBeNull();
  });

  test('taking back GitHub\'s own review cancels that review only, never a signed comment on the same commit', () => {
    const dismissed = { state: 'dismissed', commit_id: A, author_association: 'OWNER' };
    const signed = job({ status: 'pr_open', pr_head_sha: A, review_state: 'approved', review_sha: A, review_kind: 'comment' });
    expect(commentPatch(signed, dismissed)).toBeNull();
    expect(commentPatch({ ...signed, review_kind: 'formal' }, dismissed)).toEqual({ review_state: null, review_sha: null, review_at: null, review_kind: null });
  });

  test('taking back one person\'s GitHub review does not cancel another person\'s approval of the same commit', () => {
    const kept = job({ status: 'pr_open', pr_head_sha: A, review_state: 'approved', review_sha: A, review_kind: 'formal', review_at: '2026-11-20T10:05:00Z' });
    const other = { state: 'dismissed', commit_id: A, author_association: 'MEMBER', submitted_at: '2026-11-20T10:00:00Z' };
    expect(commentPatch(kept, other)).toBeNull();
    const same = { ...other, submitted_at: '2026-11-20T10:05:00Z' };
    expect(commentPatch(kept, same)).toEqual({ review_state: null, review_sha: null, review_at: null, review_kind: null });
  });

  test('"already fixed" needs the job\'s key and a signature, and the later of two commits wins for good', () => {
    const said = (sha, at, sign = CTO) => ({ body: `Nothing to build.\n${alreadyFixedMarker(KEY, sha)}\n\n${sign}`, author_association: 'OWNER', created_at: at });
    expect(alreadyFixedPatch(job(), said(A, '2026-11-20T10:00:00Z', 'unsigned'))).toBeNull();
    expect(alreadyFixedPatch(job({ task_key: OTHER_KEY }), said(A, '2026-11-20T10:00:00Z'))).toBeNull();
    let task = job();
    for (const row of [said(B, '2026-11-20T11:00:00Z'), said(M, '2026-11-20T12:00:00Z'), said(B, '2026-11-20T11:00:00Z')]) {
      task = { ...task, ...alreadyFixedPatch(task, row) };
    }
    expect(task).toMatchObject({ already_fixed_sha: M, already_fixed_state: 'claimed' });
    expect(taskProgress(task).blocker).toBe(`A review says commit ${M.slice(0, 7)} on the main branch already fixes this; waiting to confirm that commit is there.`);
  });
});

describe('done means proven', () => {
  const proven = { status: 'merged', pr_number: 77, pr_head_sha: A, pr_changed_files: 2, checks_sha: A, checks_detail: {}, checks_confirmed: 'passed', review_state: 'approved', review_sha: a7, merge_commit_sha: M };
  const gap = (change) => taskProgress({ ...proven, ...change });

  test('each missing proof is named', () => {
    expect(taskProgress(proven)).toMatchObject({ status: 'done', blocker: null, checksState: 'passed' });
    expect(gap({ pr_changed_files: 0 })).toMatchObject({ status: 'merged', blocker: 'Merged, but it changed no files.' });
    expect(gap({ pr_changed_files: null }).blocker).toBe('Merged, but the size of the change is not known yet.');
    expect(gap({ checks_confirmed: null }).blocker).toBe('Merged, but checks unknown.');
    expect(gap({ checks_sha: B }).blocker).toBe('Merged, but checks unknown.');
    expect(gap({ checks_confirmed: 'failed' }).blocker).toBe('Merged, but a check failed on the latest commit.');
    expect(gap({ checks_confirmed: 'pending' }).blocker).toBe('Merged, but checks had not finished.');
    expect(gap({ review_state: null }).blocker).toBe('Merged, but no independent review of the latest commit.');
    expect(gap({ review_sha: B }).blocker).toBe('Merged, but the review is for an older commit.');
    expect(gap({ review_state: 'changes_requested' }).blocker).toBe('Merged, but the review asked for changes.');
    expect(gap({ review_state: 'not_clean' }).blocker).toBe('Merged, but the review of the latest commit was not clean.');
    expect(gap({ merge_commit_sha: null }).blocker).toBe('Merged, but the merge commit is not recorded yet.');
    expect(gap({ checks_confirmed: null, review_state: null }).blocker).toBe('Merged, but checks unknown; no independent review of the latest commit.');
    expect(taskProgress({ status: 'open' }).blocker).toBe('Waiting for the worker to open a pull request.');
  });

  test('one early passing check is not "checks passed", and a repository with no checks says so instead of waiting for ever', () => {
    const early = gap({ checks_confirmed: null, checks_detail: { 'run:lint': 'passed' } });
    expect(early).toMatchObject({ status: 'merged', checksState: 'unconfirmed' });
    expect(early.blocker).toBe('Merged, but the checks seen so far passed; waiting to confirm with GitHub that all of them did.');
    expect(gap({ checks_confirmed: null, checks_detail: { 'run:lint': 'passed', 'run:ci': 'failed' } }).blocker).toBe('Merged, but a check failed on the latest commit.');
    expect(gap({ checks_confirmed: 'none' })).toMatchObject({ status: 'done', checksState: 'none' });
  });
});
