// server/lessons/model.js
//
// Live lessons (spec 12), the pure parts: what a class looks like, how a
// lesson board becomes a student's starter copy, and how a stream link is
// turned into an embeddable player. No I/O here, so Jest covers it all.

import { projectBoardForLink } from '../shareLinks/access.js';

export const MAX_SEATS = 16;
export const MAX_CHECKPOINTS = 12;
export const LESSON_GATES = Object.freeze(['invite', 'stripe']);
export const AGENT_MODES = Object.freeze(['own', 'instructor']);
const MAX_AGENT_BUDGET = 500_000;
const MAX_TITLE = 80;
const MAX_STEP = 120;
// Window kinds that run the lesson rather than belong to it.
const TEACHING_KINDS = new Set(['classroom']);

export class LessonError extends Error {
  constructor(message, { code = 'LESSON_ERROR', statusCode = 400 } = {}) {
    super(message);
    this.name = 'LessonError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function slug(text, index) {
  const base = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return `${index + 1}-${base || 'step'}`;
}

/** Steps arrive as strings or { title }; ids are stable per position and title. */
export function normalizeCheckpoints(input) {
  const list = Array.isArray(input) ? input : String(input || '').split('\n');
  const steps = list
    .map((step) => String(typeof step === 'object' && step ? step.title : step).trim().slice(0, MAX_STEP))
    .filter(Boolean)
    .slice(0, MAX_CHECKPOINTS);
  return steps.map((title, index) => ({ id: slug(title, index), title }));
}

/**
 * YouTube and Twitch links become their embed URL; anything else is refused
 * so a class can't frame an arbitrary site inside every student's canvas.
 */
export function normalizeStreamUrl(value, { parentHost = 'localhost' } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new LessonError('Paste a YouTube or Twitch link.', { code: 'LESSON_STREAM_URL' }); }
  if (url.protocol !== 'https:') throw new LessonError('Stream links must start with https://.', { code: 'LESSON_STREAM_URL' });
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const id = (text) => (/^[A-Za-z0-9_-]{6,64}$/.test(text || '') ? text : null);
  let video = null;
  if (host === 'youtu.be') video = id(url.pathname.slice(1));
  if (host === 'youtube.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    video = id(url.searchParams.get('v')) || (['live', 'embed', 'shorts'].includes(parts[0]) ? id(parts[1]) : null);
  }
  if (video) return `https://www.youtube.com/embed/${video}?autoplay=1`;
  if (host === 'twitch.tv') {
    const channel = url.pathname.split('/').filter(Boolean)[0];
    if (/^[A-Za-z0-9_]{3,25}$/.test(channel || '')) {
      return `https://player.twitch.tv/?channel=${channel}&parent=${encodeURIComponent(parentHost)}`;
    }
  }
  throw new LessonError('Paste a YouTube or Twitch live link.', { code: 'LESSON_STREAM_URL' });
}

export function normalizeClassInput(input = {}, options = {}) {
  const title = String(input.title || '').trim().slice(0, MAX_TITLE);
  if (!title) throw new LessonError('Name the class.', { code: 'LESSON_TITLE_REQUIRED' });
  const checkpoints = normalizeCheckpoints(input.checkpoints);
  if (!checkpoints.length) throw new LessonError('Add at least one step for students to check off.', { code: 'LESSON_STEPS_REQUIRED' });
  const seats = Math.floor(Number(input.seatLimit ?? MAX_SEATS));
  if (!Number.isFinite(seats) || seats < 1 || seats > MAX_SEATS) {
    throw new LessonError(`Seats must be between 1 and ${MAX_SEATS}.`, { code: 'LESSON_SEATS' });
  }
  const gate = LESSON_GATES.includes(input.gate) ? input.gate : 'invite';
  const stripePriceId = gate === 'stripe' ? String(input.stripePriceId || '').trim() : '';
  if (gate === 'stripe' && !/^price_[A-Za-z0-9]{6,64}$/.test(stripePriceId)) {
    throw new LessonError('Paste the Stripe price id (it starts with price_).', { code: 'LESSON_STRIPE_PRICE' });
  }
  const agentMode = AGENT_MODES.includes(input.agentMode) ? input.agentMode : 'own';
  const budget = Math.floor(Number(input.agentBudgetTokens || 0));
  if (!Number.isFinite(budget) || budget < 0 || budget > MAX_AGENT_BUDGET) {
    throw new LessonError('Per-student agent budget must be between 0 and 500,000 tokens.', { code: 'LESSON_AGENT_BUDGET' });
  }
  return {
    title,
    checkpoints,
    seatLimit: seats,
    gate,
    stripePriceId: stripePriceId || null,
    agentMode,
    // "Own keys" means the instructor's keys are never spent on students.
    agentBudgetTokens: agentMode === 'instructor' ? budget : 0,
    streamUrl: normalizeStreamUrl(input.streamUrl, options),
  };
}

/**
 * The starter board a student gets: the lesson board as a guest would see
 * it (private window kinds and secrets dropped), minus the teaching tools.
 */
export function lessonTemplate(snapshot = {}) {
  const board = projectBoardForLink(snapshot, { role: 'view', scope_kind: 'board', stage: false });
  const wins = board.wins.filter((win) => !TEACHING_KINDS.has(String(win.kind || win.type || '')));
  const ids = new Set(wins.map((win) => String(win.id)));
  return {
    wins: wins.map((win) => ({ ...win, public: undefined })),
    canvasGroups: board.canvasGroups,
    paths: board.paths,
    links: board.links.filter((edge) => ids.has(String(edge.fromId)) && ids.has(String(edge.toId))),
  };
}

/** Per-student progress for the grid: done, approved, and a 0..1 ratio. */
export function progressFor(checkpoints = [], marks = []) {
  const byId = new Map(marks.map((mark) => [mark.checkpoint_id, mark]));
  const steps = checkpoints.map((step) => {
    const mark = byId.get(step.id);
    return {
      id: step.id,
      title: step.title,
      done: Boolean(mark?.done_at),
      approved: Boolean(mark?.approved_at),
      approvedBy: mark?.approved_by || null,
      note: mark?.note || null,
    };
  });
  const done = steps.filter((step) => step.done).length;
  const approved = steps.filter((step) => step.approved).length;
  return { steps, done, approved, total: steps.length, ratio: steps.length ? done / steps.length : 0 };
}

/** Raised hands, oldest first: the help queue. */
export function helpQueue(enrollments = []) {
  return enrollments
    .filter((row) => row.status === 'active' && row.hand_raised_at)
    .sort((a, b) => new Date(a.hand_raised_at) - new Date(b.hand_raised_at))
    .map((row) => ({ enrollmentId: row.id, name: row.display_name, since: row.hand_raised_at }));
}

/** A board picture shrunk to what a grid tile draws: window boxes only. */
export function thumbnailOf(board = {}) {
  return (Array.isArray(board.wins) ? board.wins : []).slice(0, 60).map((win) => ({
    id: String(win.id),
    kind: String(win.kind || win.type || ''),
    title: String(win.title || '').slice(0, 40),
    x: Number(win.x) || 0,
    y: Number(win.y) || 0,
    w: Number(win.w) || 0,
    h: Number(win.h) || 0,
  }));
}
