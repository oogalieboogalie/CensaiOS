// Tabs inside one terminal window, like Windows Terminal. Each tab is its own
// shell (its own server session). The first tab keeps the window's original
// session id, so windows saved before tabs existed open exactly as before.

import { AGENT_HOTKEY_ACTIONS } from '../../lib/agentHotkeys.js';
import { newId } from '../../lib/ids/newId.js';

const MAX_TABS = 12;

function newTabId() {
  return newId().slice(0, 8);
}

export function terminalTabs(win = {}) {
  const tabs = Array.isArray(win.terminalTabs) ? win.terminalTabs.filter((t) => t && t.id) : [];
  return tabs.length ? tabs : [{ id: 'main' }];
}

export function activeTerminalTabId(win = {}) {
  const tabs = terminalTabs(win);
  return tabs.some((t) => t.id === win.activeTerminalTab) ? win.activeTerminalTab : tabs[0].id;
}

// The server session a tab talks to. Tab one: the window's own session.
export function tabSessionId(win = {}, tab = {}) {
  const base = win.agentSessionId || win.id;
  return tab.id === 'main' ? base : `${win.id}-tab-${tab.id}`;
}

export function tabLabel(win = {}, tab = {}, index = 0) {
  if (tab.id === 'main' && win.launchCli) {
    const action = AGENT_HOTKEY_ACTIONS.find((a) => a.cli === win.launchCli);
    return action ? action.label : String(win.launchCli);
  }
  return `Shell ${index + 1}`;
}

// Window changes (for onUpdate) that open a new tab and switch to it.
export function addTerminalTab(win = {}) {
  const tabs = terminalTabs(win);
  if (tabs.length >= MAX_TABS) return null;
  const tab = { id: newTabId() };
  return { terminalTabs: [...tabs, tab], activeTerminalTab: tab.id };
}

// Window changes that close a tab. The last tab never closes; the window's
// own close button does that.
export function closeTerminalTab(win = {}, tabId) {
  const tabs = terminalTabs(win);
  if (tabs.length <= 1) return null;
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index < 0) return null;
  const rest = tabs.filter((t) => t.id !== tabId);
  const active = activeTerminalTabId(win);
  const nextActive = active === tabId ? rest[Math.min(index, rest.length - 1)].id : active;
  return { terminalTabs: rest, activeTerminalTab: nextActive };
}

export function switchTerminalTab(win = {}, step) {
  const tabs = terminalTabs(win);
  const index = tabs.findIndex((t) => t.id === activeTerminalTabId(win));
  const next = tabs[(index + step + tabs.length) % tabs.length];
  return { activeTerminalTab: next.id };
}
