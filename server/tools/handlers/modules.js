import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { moduleModelConfig } from '../../modules/modelConfig.js';
import { spawnCanvasWindow } from '../../collaboration/workspaceMutations.js';
import { generateModule } from '../../modules/generator.js';
import { commitModuleWindow, patchLiveModuleWindow } from '../../modules/canvasModuleWindow.js';
import { titleFromRequest } from '../../../src/lib/modules/moduleFormat.js';
import { builtModulePatch } from '../../../src/lib/modules/moduleWindowState.js';

// Spec 6 chat path: "make me a tip calculator" in a chat window. The window
// opens at once in its building state for everyone on the board, the build
// streams its progress into it, and the finished module replaces it in place.

const PROGRESS_EVERY_MS = 1200;

function agentLabel(agentId) {
  return agentId ? `${agentId[0].toUpperCase()}${agentId.slice(1)}` : 'Agent';
}

export async function handleModuleTool(agentId, name, args, context = {}) {
  if (name !== 'make_module') throw new Error(`Unknown module tool: ${name}`);
  const workspaceId = String(context?.workspaceId || '').trim();
  const userId = context?.userId;
  if (!workspaceId || !userId) throw new Error('Building a module needs a signed-in workspace.');
  await requireWorkspaceMember(pool, { workspaceId, userId, roles: ['owner', 'admin', 'member'] });

  const request = String(args?.request || '').trim().slice(0, 2000);
  if (!request) return 'Error: say what the module should do.';
  const title = String(args?.title || '').trim().slice(0, 60) || titleFromRequest(request);
  const spawned = await spawnCanvasWindow(pool, {
    workspaceId, agentId, kind: 'module', title, request, nearWindowId: args?.near_window_id || context?.windowId || null,
  });
  const windowId = spawned.window.id;
  const actor = { type: 'agent', id: agentId, label: agentLabel(agentId) };

  let lastSent = 0;
  let pending = null;
  const sendProgress = (text) => {
    const now = Date.now();
    if (now - lastSent < PROGRESS_EVERY_MS) return;
    lastSent = now;
    pending = patchLiveModuleWindow(workspaceId, windowId, { buildPreview: text.slice(-4000), buildChars: text.length });
  };

  try {
    const config = await moduleModelConfig({ agentId, workspaceId, userId });
    const result = await generateModule({
      userId, workspaceId, request, config,
      onDelta: (_chunk, { text }) => sendProgress(text),
    });
    await pending;
    const patch = builtModulePatch({ request, manifest: result.manifest, source: result.source, note: 'Built from chat', by: actor.label });
    await commitModuleWindow(pool, { workspaceId, windowId, patch, actor });
    const asks = result.manifest.permissions.length
      ? ` It will ask before it ${result.manifest.permissions.map(p => (p === 'agent' ? 'calls an agent' : 'uses the internet')).join(' or ')}.`
      : '';
    return `Built the "${result.manifest.name}" module and opened it on the shared canvas (window id ${windowId}). It is running now in a sandbox; the user can ask for changes from the window's Edit panel.${asks}`;
  } catch (error) {
    await pending;
    await commitModuleWindow(pool, {
      workspaceId, windowId, actor,
      patch: { status: 'error', error: String(error?.message || 'The build failed.').slice(0, 300), buildPreview: null },
    }).catch(() => undefined);
    return `Error: the module could not be built (${error?.message || 'unknown error'}). The window on the canvas shows a Try again button.`;
  }
}
