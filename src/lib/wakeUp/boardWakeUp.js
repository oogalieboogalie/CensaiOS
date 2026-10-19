// The board wakes up (awe list item 3): the first time a brand-new account
// opens its own board, three windows glide in instead of an empty canvas: a
// greeting chat, a short "try this" list and a finished sample LeadHound run.
//
// "Brand-new" is decided twice so an existing board can never be touched:
//   1. the server had never stored this board (its load answered 404, with no
//      board id asked for, so not a share link), noted at boot by
//      noteBoardLoad, and
//   2. this browser has not woken this board before (a localStorage marker).
// The board must also still be empty when the windows are about to land.

import { SAMPLE_HUNT } from './sampleHunt.js';
import { getDefaultWindowSize } from '../windowManifest.js';

export const WAKE_UP_VERSION = 1;
// How long after waking the windows still play their glide-in.
export const WAKE_GLIDE_MS = 4000;

let freshBoard = null;

/** Called once per boot with the workspace load result and the signed-in user. */
export function noteBoardLoad(loaded, { requestedId = null, user = null } = {}) {
  const neverStored = loaded?.status === 'ready' && loaded.value == null && loaded.revision === 0;
  freshBoard = neverStored && !requestedId && loaded.workspaceId
    ? { workspaceId: loaded.workspaceId, name: firstName(user?.name) }
    : null;
}

/** The fresh board noted at boot, if it is this one. */
export function freshBoardFor(workspaceId) {
  return freshBoard && workspaceId && freshBoard.workspaceId === workspaceId ? freshBoard : null;
}

export function wakeUpStorageKey(workspaceId) {
  return `censai.boardWakeUp.v${WAKE_UP_VERSION}:${workspaceId || 'unknown'}`;
}

export function hasWokenUp(workspaceId, storage = globalThis.localStorage) {
  try { return Boolean(storage?.getItem(wakeUpStorageKey(workspaceId))); } catch { return true; }
}

export function markWokenUp(workspaceId, storage = globalThis.localStorage) {
  try { storage?.setItem(wakeUpStorageKey(workspaceId), new Date().toISOString()); } catch { /* private mode */ }
}

export function shouldWakeUp({ workspaceId, wins, storage = globalThis.localStorage }) {
  if (!freshBoardFor(workspaceId)) return false;
  if ((wins || []).length > 0) return false;
  return !hasWokenUp(workspaceId, storage);
}

function firstName(name) {
  const clean = String(name || '').trim().split(/\s+/)[0] || '';
  // Local sign-in with no name typed stores "Owner"; greet no one rather than that.
  return /^owner$/i.test(clean) ? '' : clean.slice(0, 40);
}

export function greetingText(name) {
  const hello = name ? `Hi ${name}, welcome to censaiOS.` : 'Hi, welcome to censaiOS.';
  return [
    `${hello} I'm Censai, and this board is yours.`,
    'Next to me is a finished **LeadHound** hunt for a made-up business, so you can see what a real one looks like. Below me is a short **Try this** list, one click each.',
    'Add your AI key whenever you want to talk to me. When you have seen enough, **Clear the welcome windows** at the bottom of the list empties the board.',
  ].join('\n\n');
}

// World positions, laid out around the middle of the empty board (the empty
// camera puts world 0,0 at the centre of the screen). Chat over the list on
// the left, the sample hunt on the right. The chat and the list open at
// their usual sizes (the same as from the Add menu); the sample hunt is
// opened tall on purpose so its finished results show without scrolling.
const GAP = 24;
const TOP = -420;
const HUNT = { x: -236, y: TOP, w: 900, h: 884 };

function wakeUpLayout() {
  const chat = getDefaultWindowSize('chat');
  const tryThis = getDefaultWindowSize('tryThis');
  const right = HUNT.x - GAP;
  return {
    chat: { x: right - chat.w, y: TOP, ...chat },
    tryThis: { x: right - tryThis.w, y: TOP + chat.h + GAP, ...tryThis },
    leadHound: HUNT,
  };
}

/** The three windows, as spawnAt arguments, in the order they glide in. */
export function wakeUpWindows({ name = '', now = Date.now() } = {}) {
  const tag = (order) => ({ wakeUp: true, wakeUpOrder: order, wakeUpAt: now });
  const at = ({ x, y, w, h }) => [{ x, y }, { w, h }];
  const LAYOUT = wakeUpLayout();
  return [
    ['chat', { agentId: 'censai', title: 'Censai', msgs: [{ from: 'censai', text: greetingText(name) }], ...tag(1) }, ...at(LAYOUT.chat)],
    ['leadHound', { title: 'LeadHound · sample hunt', leadHound: { brief: SAMPLE_HUNT.brief, result: SAMPLE_HUNT, sample: true }, ...tag(2) }, ...at(LAYOUT.leadHound)],
    ['tryThis', { title: 'Try this', tried: {}, ...tag(3) }, ...at(LAYOUT.tryThis)],
  ];
}

export function wakeUpWindowIds(wins) {
  return (wins || []).filter((win) => win.wakeUp).map((win) => win.id);
}

/** Whether a window should still play its glide-in (and in which slot). */
export function glideOrder(win, now = Date.now()) {
  if (!win?.wakeUp || !Number.isFinite(win.wakeUpAt)) return undefined;
  return now - win.wakeUpAt < WAKE_GLIDE_MS ? String(win.wakeUpOrder || 1) : undefined;
}
