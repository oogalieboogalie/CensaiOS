// "Chat to module", server half (frontier architecture part 3). Agents can
// look inside a sealed module on the board (read_module) and press one of
// the tools its manifest v3 declares (use_module). The module's code runs in
// a sandbox in the browser, so the call travels through the board document:
// this writes it onto the module window as `agentCall`, a browser on the
// board runs it inside the sandbox (src/components/modules/
// useModuleAgentCalls.js), and the result comes back the same way. Everyone
// on the board sees the agent use the module while it happens.

import { randomUUID } from 'crypto';
import * as Y from 'yjs';
import { openCanvasDocReader, transactCanvasDoc } from '../collab/liveDoc.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import { patchWindowInDoc } from './canvasModuleWindow.js';
import { normalizeManifest } from '../../src/lib/modules/moduleFormat.js';
import { describePermissions, findTool } from '../../src/lib/modules/manifestV3.js';
import { checkToolInput } from '../../src/lib/modules/manifestV3Checks.js';
import { AGENT_CALL_STATUS, isFinished, newAgentCall, toolLabel } from '../../src/lib/modules/moduleAgentCalls.js';

export const USE_MODULE_TIMEOUT_MS = 25000;
const POLL_MS = 200;
const MAX_DATA_CHARS = 4000;

function windowsMap(doc) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  return windows instanceof Y.Map ? windows : null;
}

function readWindow(doc, windowId) {
  const value = windowsMap(doc)?.get(String(windowId));
  return value instanceof Y.Map ? value.toJSON() : (value && typeof value === 'object' ? value : null);
}

/**
 * A window on the board that runs a module with a manifest: an on-demand
 * module (code on the record) or a sealed built-in window, whose code ships
 * in its folder and which puts only its manifest on the record.
 */
export function isModuleWindow(win) {
  if (!win || !win.manifest || typeof win.manifest !== 'object') return false;
  if (win.kind === 'module') return Boolean(win.source) && win.status === 'ready';
  return true;
}

function moduleSummary(win) {
  const manifest = normalizeManifest(win.manifest, { request: win.request });
  return { win, manifest };
}

export function listModules(doc) {
  const out = [];
  windowsMap(doc)?.forEach((value, id) => {
    const win = value instanceof Y.Map ? value.toJSON() : value;
    if (isModuleWindow(win)) out.push(moduleSummary({ ...win, id: win.id || id }));
  });
  return out;
}

function clip(value, max = MAX_DATA_CHARS) {
  let text;
  try { text = JSON.stringify(value ?? {}, null, 0); } catch { text = String(value); }
  return text.length > max ? `${text.slice(0, max)}… (cut, ${text.length} characters in all)` : text;
}

function toolLine(tool) {
  const props = Object.entries(tool.input?.properties || {});
  const required = new Set(tool.input?.required || []);
  const fields = props.map(([key, spec]) => `${key}${required.has(key) ? '' : '?'}: ${spec.type}${spec.enum ? ` (${spec.enum.join('|')})` : ''}`).join(', ');
  return `- ${tool.name}(${fields}): ${tool.description || toolLabel(tool.name)}`;
}

export function describeModule({ win, manifest }, { withData = true } = {}) {
  const lines = [
    `"${manifest.name}" (window id ${win.id}), version ${manifest.version}${manifest.author ? ` by ${manifest.author}` : ''}.`,
    manifest.description ? manifest.description : null,
    `May: ${describePermissions(manifest).join('; ') || 'only draw in its own window'}.`,
    manifest.tools.length ? `Tools you can use with use_module:\n${manifest.tools.map(toolLine).join('\n')}` : 'It declares no tools, so agents can read it but not drive it.',
    manifest.state && Object.keys(manifest.state).length ? `Saved data fields: ${Object.entries(manifest.state).map(([k, v]) => `${k} (${v})`).join(', ')}` : null,
    withData ? `Saved data now: ${clip(win.moduleData || {})}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

async function withReader(workspaceId, fn) {
  const reader = await openCanvasDocReader(workspaceId);
  if (!reader) return null;
  try { return await fn(reader.doc); } finally { await reader.close(); }
}

/** read_module: list the board's modules, or describe one with its data. */
export async function readModule({ workspaceId, windowId = '' }) {
  const out = await withReader(workspaceId, (doc) => {
    if (windowId) {
      const win = readWindow(doc, windowId);
      if (!isModuleWindow(win)) return `Error: window ${windowId} is not a module on this board. Call read_module with no window_id to list them.`;
      return describeModule(moduleSummary({ ...win, id: windowId }));
    }
    const modules = listModules(doc);
    if (!modules.length) return 'There are no modules on this board yet. make_module builds one.';
    return [`${modules.length} module${modules.length === 1 ? '' : 's'} on this board:`,
      ...modules.map(m => `- "${m.manifest.name}" (window id ${m.win.id}): ${m.manifest.tools.length ? `tools ${m.manifest.tools.map(t => t.name).join(', ')}` : 'no tools'}`),
      'Call read_module with a window_id to see a module\'s tools and saved data.'].join('\n');
  });
  return out ?? 'Error: the board is not running, so its modules cannot be read right now.';
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * use_module: press a declared tool. Resolves with what the module returned,
 * once a browser on the board has run it, or explains why it could not.
 */
export async function useModule({ workspaceId, windowId, tool: toolName, input = {}, by = 'Agent', timeoutMs = USE_MODULE_TIMEOUT_MS }) {
  if (!windowId) return 'Error: say which module (window_id). read_module lists them.';
  const reader = await openCanvasDocReader(workspaceId);
  if (!reader) return 'Error: the board is not running, so the module cannot be used right now.';
  try {
    const win = readWindow(reader.doc, windowId);
    if (!isModuleWindow(win)) return `Error: window ${windowId} is not a module on this board.`;
    const manifest = normalizeManifest(win.manifest, { request: win.request });
    const tool = findTool(manifest, toolName);
    if (!tool) {
      return `Error: "${manifest.name}" has no "${toolName}" tool. ${manifest.tools.length ? `Its tools: ${manifest.tools.map(t => t.name).join(', ')}.` : 'It declares no tools.'}`;
    }
    const checked = checkToolInput(tool, input);
    if (!checked.ok) return `Error: ${checked.error} ${toolLine(tool)}`;
    const busy = win.agentCall;
    if (busy?.id && !isFinished(busy) && Date.now() - Date.parse(busy.at || 0) < timeoutMs) {
      return `Error: ${busy.by || 'Another agent'} is using "${manifest.name}" right now. Try again in a moment.`;
    }

    const call = newAgentCall({ id: randomUUID(), tool: tool.name, input: checked.input, by });
    const written = await transactCanvasDoc(workspaceId, doc => patchWindowInDoc(doc, windowId, { agentCall: call }));
    if (!written) return 'Error: the board is not running, so the module cannot be used right now.';

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const now = readWindow(reader.doc, windowId)?.agentCall;
      if (!now || now.id !== call.id) return `Error: the module window was closed or changed before "${tool.name}" finished.`;
      if (now.status === AGENT_CALL_STATUS.done) {
        return `Used "${tool.name}" on "${manifest.name}". The module answered: ${clip(now.result, 2000)}`;
      }
      if (now.status === AGENT_CALL_STATUS.error) return `Error: "${manifest.name}" could not ${toolLabel(tool.name)}: ${now.error}`;
    }
    const last = readWindow(reader.doc, windowId)?.agentCall;
    if (last?.id === call.id && !isFinished(last)) {
      await transactCanvasDoc(workspaceId, doc => patchWindowInDoc(doc, windowId, {
        agentCall: { ...last, status: AGENT_CALL_STATUS.expired, doneAt: new Date().toISOString() },
      })).catch(() => undefined);
    }
    return last?.status === AGENT_CALL_STATUS.waiting
      ? `Error: nobody has this board open, so "${manifest.name}" is not running. Modules run in the browser; ask the person to open the board, then try again.`
      : `Error: "${manifest.name}" did not answer in time.`;
  } finally {
    await reader.close();
  }
}
