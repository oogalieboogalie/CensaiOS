// What a comment or review on a coding job's pull request (or its issue) means:
// a review of a commit, the merge-bot's line, or "already fixed". Pure.
//
// A known limit, said plainly: every agent here posts from the owner's one
// GitHub account, so the app cannot tell the reviewer from the author by
// account. "Independent" is a house rule (AGENTS.md: a session that did not
// write the pull request reviews it); what is checked here is that the review
// has the house form, names the latest commit and says it was clean.
import { alreadyFixedIn } from './taskMarker.js';
import { clean, lower, sameCommit } from './agentTaskFacts.js';

// Who may sign a review, post the merge-bot's line or record "already fixed":
// the repository's owner or a member of its organisation. GitHub also calls
// an invited outsider a collaborator, with or without the right to push, so
// that word alone is not enough.
const BELONGS = new Set(['OWNER', 'MEMBER']);
// The house review ends with the line "-- CTO" written with a long dash (AGENTS.md, "One way into master").
const SIGNED = /(?:^|\n)[ \t]*(?:\u2014|\u2013|--)[ \t]*CTO[ \t]*$/;
// The house review form (.claude/skills/pr-review/SKILL.md): "Independent bug
// review on head <commit>: clean. ... Safe to merge." or "... It merges once CI
// is green." "of head" and bold or italic words are read the same.
const REVIEW_FORM = /\bindependent bug review (?:on|of) head\s+`?([0-9a-f]{7,40})`?\s*:\s*(\S+)/i;
const GO = /\bsafe to merge\b|\bit merges once ci is green\b/i;
// "Needs changes" / "Not cleared" from any member, signed or not, as a verdict:
// at the start of the comment or of a line (not a quoted one), so "nothing else
// needs changes" or "this no longer needs changes" is no verdict.
const NEEDS_CHANGES = /(?:^|\n)[ \t#+-]*(?:verdict[ \t]*:[ \t]*)?(?:needs[-\s]*changes|not[-\s]*cleared)\b/i;
// What makes a signed comment a verdict against the commit.
const NOT_CLEAN = /\bdo not merge\b|\bnot safe to merge\b|\bnot clean\b/i;
// Findings (pr-review step 6: "post the findings in plain words, numbered"): a
// numbered list, or "2 findings". "0 findings" is none.
const FINDINGS = /(?:^|\n)[ \t]*[1-9]\d*[.)][ \t]+\S|\b[1-9]\d*\s+(?:real\s+)?findings?\b/i;
// The pr-review line when only master was brought in since a clean review: it
// says nothing about the new commit by itself, so it neither passes nor blocks.
const MASTER_ONLY = /\bmaster\b[\s\S]*\b(?:stands|still holds|still clean|carries over)\b/i;
const MERGE_BOT = /^merge-bot:/i;
// Bold and italic marks are read as plain words; struck-through words were taken back.
const plain = (body) => String(body).replace(/~~[\s\S]*?~~/g, '').replace(/\*+|_+/g, '');

function namedCommit(body, head) {
  const tokens = String(body).match(/\b[0-9a-f]{7,40}\b/gi) || [];
  if (head && tokens.some((token) => sameCommit(token, head))) return lower(head);
  const other = tokens.find((token) => /\d/.test(token) && /[a-f]/i.test(token));
  return other ? other.toLowerCase() : '';
}

/**
 * A comment or review in one shape: { body, association, state, commitId, at }.
 * GitHub's own names (author_association, commit_id, submitted_at) are read too.
 */
export function commentFacts(row = {}) {
  return {
    body: String(row.body ?? '').replace(/\u00a0/g, ' '),
    association: clean(row.association || row.author_association).toUpperCase(),
    state: clean(row.state).toUpperCase(),
    commitId: lower(row.commitId || row.commit_id),
    at: clean(row.at || row.submitted_at || row.updated_at || row.created_at) || null,
  };
}

const time = (at) => (at ? new Date(at).getTime() : 0);
const later = (at, than) => !than || !at || time(at) >= time(than);

/**
 * The verdict a comment carries, or null (no verdict: it neither passes nor
 * blocks): { state, sha, at, kind }.
 *   approved           GitHub's own Approve, or a signed review in the clean form for that commit
 *   changes_requested  GitHub's Request changes, or any member's "Needs changes" / "Not cleared" verdict
 *   not_clean          a signed comment naming a commit that says "do not merge" or "not
 *                      clean", or (unless it is the "only master was brought in" line) is
 *                      the house form without "clean" or lists findings
 * kind is 'formal' for GitHub's own review, 'comment' otherwise. `headAt` is
 * when the latest commit was first seen: an unsigned verdict naming no commit
 * was about the commit current when it was written, so one written before
 * `headAt` says nothing about the latest commit and is left out.
 */
export function reviewFact(row, headSha, { headAt = null } = {}) {
  const c = commentFacts(row);
  if (!BELONGS.has(c.association) || MERGE_BOT.test(c.body.trim())) return null;
  if (c.commitId && (c.state === 'APPROVED' || c.state === 'CHANGES_REQUESTED')) {
    return { state: c.state === 'APPROVED' ? 'approved' : 'changes_requested', sha: c.commitId, at: c.at, kind: 'formal' };
  }
  if (c.state === 'DISMISSED') return null;
  const text = plain(c.body);
  const named = namedCommit(text, headSha) || c.commitId;
  const sha = named || lower(headSha);
  if (!sha) return null;
  if (NEEDS_CHANGES.test(text)) {
    if (!named && headAt && c.at && !later(c.at, headAt)) return null;
    return { state: 'changes_requested', sha, at: c.at, kind: 'comment' };
  }
  if (!SIGNED.test(text.trimEnd()) || !named) return null;
  const form = REVIEW_FORM.exec(text);
  const clean = Boolean(form) && /^clean\b/i.test(form[2]) && sameCommit(form[1], sha) && GO.test(text) && !NOT_CLEAN.test(text);
  if (clean) return { state: 'approved', sha, at: c.at, kind: 'comment' };
  const notClean = { state: 'not_clean', sha, at: c.at, kind: 'comment' };
  if (NOT_CLEAN.test(text)) return notClean;
  if (MASTER_ONLY.test(text)) return null;
  return form || FINDINGS.test(text) ? notClean : null;
}

/** The merge-bot's line ("merge-bot: not merging yet, ..."), or null. */
export function mergeBotFact(row) {
  const c = commentFacts(row);
  const body = c.body.trim();
  if (!BELONGS.has(c.association) || !MERGE_BOT.test(body)) return null;
  return { note: body.replace(MERGE_BOT, '').replace(/\s+/g, ' ').trim().slice(0, 200), at: c.at };
}

/** A signed "already fixed by <commit>" line for this job, or null. */
export function alreadyFixedFact(row, task) {
  const c = commentFacts(row);
  if (!task.task_key || !BELONGS.has(c.association) || !SIGNED.test(plain(c.body).trimEnd())) return null;
  const hit = alreadyFixedIn(c.body).find((item) => item.taskKey === lower(task.task_key));
  return hit ? { sha: hit.sha, at: c.at } : null;
}

/** The changes a pull request comment or review makes to a job (review, merge-bot line), or null. */
export function commentPatch(task, row) {
  const patch = {};
  const seen = commentFacts(row);
  // Taking back GitHub's own review cancels that one review only: never a
  // signed comment, and never someone else's review of the same commit. A
  // review keeps the time it was sent when it is taken back, so that time
  // (with the commit) tells which review it was.
  if (seen.state === 'DISMISSED') {
    const theirs = task.review_kind === 'formal' && seen.commitId && sameCommit(task.review_sha, seen.commitId)
      && (!seen.at || !task.review_at || time(seen.at) === time(task.review_at));
    return theirs ? { review_state: null, review_sha: null, review_at: null, review_kind: null } : null;
  }
  const head = task.pr_head_sha;
  const review = reviewFact(row, head, { headAt: task.pr_head_at });
  // The latest verdict on the latest commit wins: a later word about an older
  // commit does not replace one about the latest.
  const covers = (sha) => Boolean(head) && sameCommit(sha, head);
  if (review && later(review.at, task.review_at) && (covers(review.sha) || !covers(task.review_sha))) {
    Object.assign(patch, {
      review_state: review.state, review_sha: review.sha, review_kind: review.kind,
      review_at: review.at || new Date().toISOString(),
    });
  }
  const bot = mergeBotFact(row);
  // A line written before the latest commit was about the older one.
  if (bot && task.status === 'pr_open' && later(bot.at, task.pr_head_at)) patch.merge_bot_note = bot.note;
  return Object.keys(patch).length ? patch : null;
}

/**
 * The changes an "already fixed" comment makes: the claim is kept until GitHub
 * confirms the commit. When two comments name different commits the later
 * one wins, and an earlier one never comes back.
 */
export function alreadyFixedPatch(task, row) {
  const fact = alreadyFixedFact(row, task);
  if (!fact || !['open', 'closed'].includes(task.status)) return null;
  if (lower(task.already_fixed_sha) === fact.sha) return null;
  if (task.already_fixed_sha && time(fact.at) <= time(task.review_at)) return null;
  return {
    already_fixed_sha: fact.sha, already_fixed_state: 'claimed',
    review_state: 'approved', review_sha: fact.sha, review_kind: 'comment', review_at: fact.at || new Date().toISOString(),
  };
}
