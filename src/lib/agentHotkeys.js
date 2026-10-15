// Alt hotkeys that open a terminal straight into a coding CLI (Claude Code,
// Codex, Copilot CLI, Gemini CLI, OpenCode) or a plain shell. Each person
// can change or turn off any key in Settings → Hotkeys; their choice is
// kept in this browser (localStorage), like the group hotkeys.
//
// Keys are Alt + a letter, with Shift optional. Alt+digits stay with the
// group hotkeys (useGroupHotkeys), and Ctrl combos collide with the browser,
// so neither can be picked here. The defaults also skip the Alt letters the
// CLIs use themselves inside their terminal (Claude Code: Alt+P model,
// Alt+T thinking, Alt+M mode; shells: Alt+B / Alt+F / Alt+D word moves).

export const AGENT_HOTKEY_ACTIONS = Object.freeze([
  { id: 'claudecode', label: 'Claude Code', cli: 'claudecode', defaultKey: 'Alt+C' },
  { id: 'codex', label: 'Codex', cli: 'codex', defaultKey: 'Alt+Shift+C' },
  { id: 'copilot', label: 'GitHub Copilot CLI', cli: 'copilot', defaultKey: 'Alt+G' },
  { id: 'gemini', label: 'Gemini CLI', cli: 'gemini', defaultKey: 'Alt+Shift+G' },
  { id: 'opencode', label: 'OpenCode', cli: 'opencode', defaultKey: 'Alt+O' },
  { id: 'terminal', label: 'Plain terminal', cli: null, defaultKey: 'Alt+Shift+T' },
]);

const STORAGE_KEY = 'censai.agentHotkeys.v1';
export const AGENT_HOTKEYS_CHANGED = 'censai:agent-hotkeys-changed';

/** 'Alt+Shift+C' → { shift: true, letter: 'C' }, or null when not allowed. */
export function parseHotkey(text) {
  const parts = String(text || '').split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const letter = parts.pop().toUpperCase();
  if (!/^[A-Z]$/.test(letter)) return null;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  if (!mods.has('alt')) return null;
  for (const mod of mods) if (mod !== 'alt' && mod !== 'shift') return null;
  return { shift: mods.has('shift'), letter };
}

export function formatHotkey(parsed) {
  return parsed ? `Alt+${parsed.shift ? 'Shift+' : ''}${parsed.letter}` : '';
}

/**
 * The key a keydown means, as 'Alt+C' text, or '' when it is not an Alt
 * letter. Uses e.code so Option+C on a Mac (which types ç) still reads C.
 */
export function hotkeyFromEvent(e) {
  if (!e?.altKey || e.ctrlKey || e.metaKey) return '';
  const match = /^Key([A-Z])$/.exec(e.code || '');
  return match ? formatHotkey({ shift: Boolean(e.shiftKey), letter: match[1] }) : '';
}

export function defaultAgentHotkeys() {
  return Object.fromEntries(AGENT_HOTKEY_ACTIONS.map((a) => [a.id, a.defaultKey]));
}

/** Saved choices over the defaults. '' means the person turned that key off. */
export function mergeAgentHotkeys(saved) {
  const out = defaultAgentHotkeys();
  if (!saved || typeof saved !== 'object') return out;
  for (const action of AGENT_HOTKEY_ACTIONS) {
    const value = saved[action.id];
    if (value === '') out[action.id] = '';
    else if (typeof value === 'string' && parseHotkey(value)) out[action.id] = formatHotkey(parseHotkey(value));
  }
  return out;
}

export function loadAgentHotkeys() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return mergeAgentHotkeys(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultAgentHotkeys();
  }
}

export function saveAgentHotkeys(map) {
  const clean = mergeAgentHotkeys(map);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch { /* private window: the change lasts until reload */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AGENT_HOTKEYS_CHANGED, { detail: clean }));
  return clean;
}

/**
 * Give one action a key. Any other action already on that key loses it
 * (turned off), so one press never opens two things.
 */
export function assignAgentHotkey(map, actionId, key) {
  const value = key ? formatHotkey(parseHotkey(key)) : '';
  if (key && !value) return map;
  const next = { ...map, [actionId]: value };
  if (value) {
    for (const [id, existing] of Object.entries(next)) {
      if (id !== actionId && existing === value) next[id] = '';
    }
  }
  return next;
}

/** Which action a keydown triggers, or null. */
export function actionForEvent(map, e) {
  const key = hotkeyFromEvent(e);
  if (!key) return null;
  const id = Object.keys(map).find((k) => map[k] === key);
  return AGENT_HOTKEY_ACTIONS.find((a) => a.id === id) || null;
}
