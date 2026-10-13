import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { getSubAgentById } from '../../memory.js';
import { describeCad, editCadPatch } from '../../collaboration/cadAgent.js';
import { loadPdfWindow, savePdfFields } from '../../collaboration/pdfTools.js';

// read_cad_part and edit_cad_part: YorWare CAD windows for agents.
function requireContext(context) {
  const workspaceId = String(context?.workspaceId || '').trim();
  const userId = context?.userId;
  if (!workspaceId || !userId) throw new Error('CAD tools need an authenticated workspace context.');
  return { workspaceId, userId };
}

async function run(agentId, name, args, context) {
  const scope = requireContext(context);
  const where = { workspaceId: scope.workspaceId, windowId: args.window_id, kind: 'yorCad' };
  if (name === 'read_cad_part') {
    await requireWorkspaceMember(pool, scope);
    return describeCad(await loadPdfWindow(pool, where));
  }
  if (name !== 'edit_cad_part') throw new Error(`Unknown CAD tool: ${name}`);
  await requireWorkspaceMember(pool, { ...scope, roles: ['owner', 'admin', 'member'] });
  const sub = await getSubAgentById(agentId, context).catch(() => null);
  if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
    return `Error: ${sub.permission} sub-agents cannot change CAD parts. Use the \`report\` tool instead.`;
  }
  const win = await loadPdfWindow(pool, where);
  const title = win.title || 'the part';
  const { patch, summary } = editCadPatch(win, { code: args.code, params: args.params });
  await savePdfFields(pool, { ...where, agentId, fields: patch, activity: { kind: 'canvas.cad.edited', label: `${summary} in ${title}` } });
  return `Done: ${summary} in "${title}". Everyone with the window open sees the new part; call read_cad_part to see whether it built.`;
}

export async function handleCadTool(agentId, name, args = {}, context = {}) {
  try {
    return await run(agentId, name, args || {}, context);
  } catch (error) {
    if (error.code) return `Error: ${error.message}`;
    throw error;
  }
}
