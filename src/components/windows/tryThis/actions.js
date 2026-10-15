// What each "Try this" line does. Every step acts on the real board through
// the workspace store, so a click always shows something that exists.

import { useWorkspaceStore } from '../../../lib/store.js';
import { computeFitView } from '../../../lib/canvasMath.js';
import { wakeUpWindowIds } from '../../../lib/wakeUp/boardWakeUp.js';
import { leadToMarkdown, slugify } from '../../leadhound/exportLead.js';

const store = () => useWorkspaceStore.getState();
const sampleHound = (wins) => wins.find((win) => win.kind === 'leadHound' && win.leadHound?.result?.leads?.length);
const chatWindow = (wins) => wins.find((win) => win.wakeUp && win.kind === 'chat') || wins.find((win) => win.kind === 'chat');

function inView(win, { pan, zoom }) {
  const left = pan.x + win.x * zoom;
  const top = pan.y + win.y * zoom;
  return left >= 0 && top >= 0
    && left + (win.w ?? win.width ?? 0) * zoom <= window.innerWidth
    && top + (win.h ?? win.height ?? 0) * zoom <= window.innerHeight;
}

/**
 * Bring a window to the front. If it is off screen, move the view so it and
 * this list are both in sight, so the next step is never lost.
 */
export function showWindow(win) {
  if (!win) return false;
  const state = store();
  if (!inView(win, state)) {
    const list = state.wins.find((w) => w.kind === 'tryThis');
    const fit = computeFitView([win, list].filter(Boolean), []);
    state.setPan({ x: fit.x, y: fit.y });
    state.setZoom(fit.zoom);
  }
  state.setActiveId(win.id);
  return true;
}

function openSettings(settingsTab) {
  const { wins, onUpdate, spawnAt } = store();
  const existing = wins.find((win) => win.kind === 'appearance');
  if (existing) onUpdate(existing.id, { settingsTab, settingsRequestId: crypto.randomUUID(), maximized: false });
  const id = existing?.id || spawnAt('appearance', { title: 'Settings', settingsTab });
  return showWindow(store().wins.find((win) => win.id === id));
}

function openLeadPlan() {
  const hound = sampleHound(store().wins);
  const result = hound?.leadHound?.result;
  const lead = result?.leads?.[0];
  if (!lead) return false;
  const pos = { x: hound.x + (hound.w || 820) + 24, y: hound.y };
  const id = store().spawnAt('doc', {
    title: `${lead.company} outreach`,
    fileName: `${slugify(lead.company)}-outreach.md`,
    text: leadToMarkdown(lead, result.brief),
  }, pos, { w: 640, h: Math.max(560, hound.h || 0) });
  showWindow(store().wins.find((win) => win.id === id));
  return true;
}

function sayHello() {
  const chat = chatWindow(store().wins);
  if (!showWindow(chat)) return false;
  // Put the cursor in the chat box so they can start typing straight away.
  setTimeout(() => document.querySelector(`[data-win-id="${chat.id}"] textarea`)?.focus(), 60);
  return true;
}

export const TRY_STEPS = [
  { id: 'sample', title: 'Read a finished lead hunt', detail: 'Three made-up companies found, scored and given a 7-day intro plan.', run: () => showWindow(sampleHound(store().wins)) },
  { id: 'doc', title: "Open the top lead's plan as a document", detail: 'The whole plan in one page you can edit, copy or export.', run: openLeadPlan },
  { id: 'key', title: 'Add your AI key', detail: 'Your own key, your own bill. Chat and LeadHound start working with it.', run: () => openSettings('vault') },
  { id: 'hello', title: 'Say hi to Censai', detail: 'Ask it anything, or ask it to open a window for you.', run: sayHello },
  { id: 'board', title: 'Start a ready-made board', detail: 'Developer, Code Workspace, Creative Studio, Agent Team and more: windows, groups and AI teammates in one click.', run: () => window.dispatchEvent(new CustomEvent('censai:open-templates')) },
  { id: 'modules', title: 'Browse every module', detail: 'Docs, sheets, music, games, agents and more, all on this board.', run: () => window.dispatchEvent(new CustomEvent('censai:open-add-palette')) },
  { id: 'tour', title: 'Take the one-minute tour', detail: 'Open, arrange and group windows with a guide.', run: () => window.dispatchEvent(new CustomEvent('censai:first-mission', { detail: { action: 'start' } })) },
];

/** One click: the greeting chat, this list and the sample hunt all go. */
export function clearWelcomeWindows() {
  const { wins, deleteWindows } = store();
  const ids = wakeUpWindowIds(wins);
  if (ids.length) deleteWindows(ids);
  return ids.length;
}
