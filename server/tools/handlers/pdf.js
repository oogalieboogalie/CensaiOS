import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { getSubAgentById } from '../../memory.js';
import { describePdf, fillFieldPatch, signHerePatch } from '../../collaboration/pdfAgent.js';
import { loadPdfWindow, savePdfFields } from '../../collaboration/pdfTools.js';

// read_pdf, fill_pdf_field and sign_here: YorWare PDF windows for agents.
function requireContext(context) {
  const workspaceId = String(context?.workspaceId || '').trim();
  const userId = context?.userId;
  if (!workspaceId || !userId) throw new Error('PDF tools need an authenticated workspace context.');
  return { workspaceId, userId };
}

async function requireWriter(agentId, scope, context) {
  await requireWorkspaceMember(pool, { ...scope, roles: ['owner', 'admin', 'member'] });
  const sub = await getSubAgentById(agentId, context).catch(() => null);
  if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
    return `Error: ${sub.permission} sub-agents cannot change PDFs. Use the \`report\` tool instead.`;
  }
  return null;
}

async function run(agentId, name, args, context) {
  const scope = requireContext(context);
  const where = { workspaceId: scope.workspaceId, windowId: args.window_id };
  if (name === 'read_pdf') {
    await requireWorkspaceMember(pool, scope);
    return describePdf(await loadPdfWindow(pool, where), { fromPage: args.from_page, toPage: args.to_page });
  }
  const refused = await requireWriter(agentId, scope, context);
  if (refused) return refused;
  const win = await loadPdfWindow(pool, where);
  const title = win.title || 'the PDF';
  if (name === 'fill_pdf_field') {
    const { patch, field, value, pages } = await fillFieldPatch(win, args.field, args.value);
    const shown = field.type === 'check' ? (value ? 'ticked' : 'cleared') : `"${value}"`;
    await savePdfFields(pool, { ...where, agentId, fields: patch, activity: { kind: 'canvas.pdf.filled', label: `filled "${field.name}" in ${title}` } });
    return `Filled "${field.name}" with ${shown} on page ${pages.join(', ')} of "${title}". Everyone on the board sees it, and it prints into the exported PDF.`;
  }
  if (name === 'sign_here') {
    const { patch, pageNumber, how } = await signHerePatch(win, {
      page: args.page, nearText: args.near_text, field: args.field, signer: args.signer, note: args.note, agentId,
    });
    const who = String(args.signer || '').trim();
    await savePdfFields(pool, { ...where, agentId, fields: patch, activity: { kind: 'canvas.pdf.signHere', label: `asked ${who || 'someone'} to sign page ${pageNumber} of ${title}` } });
    return `Put a "Sign here"${who ? ` flag for ${who}` : ' flag'} on page ${pageNumber} of "${title}" ${how}. A person signs it with one click; the flag never prints.`;
  }
  throw new Error(`Unknown PDF tool: ${name}`);
}

export async function handlePdfTool(agentId, name, args = {}, context = {}) {
  try {
    return await run(agentId, name, args || {}, context);
  } catch (error) {
    if (error.code) return `Error: ${error.message}`;
    throw error;
  }
}
