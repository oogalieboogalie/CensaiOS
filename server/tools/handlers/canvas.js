import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { getSubAgentById } from '../../memory.js';
import {
  appendCollaborativeWindowText,
  listCollaborativeCanvasWindows,
  listCanvasWindowIndex,
  spawnCanvasWindow,
} from '../../collaboration/workspaceMutations.js';
import { buildPreviewWindow, normalizePreviewType } from '../../collaboration/previewBuilder.js';
import { formatCollaborationEpisodes } from '../../collaboration/episodePolicy.js';
import { listRecentCollaborationEpisodesSafely } from '../../collaboration/episodeStore.js';

function requireContext(context) {
  const workspaceId = String(context?.workspaceId || '').trim();
  const userId = context?.userId;
  if (!workspaceId || !userId) {
    throw new Error('Canvas collaboration requires an authenticated workspace context.');
  }
  return { workspaceId, userId };
}

export async function handleCanvasCollaborationTool(agentId, name, args, context = {}) {
  const scope = requireContext(context);
  if (name === 'canvas_list_writable_windows') {
    await requireWorkspaceMember(pool, scope);
    const [result, episodes] = await Promise.all([
      listCollaborativeCanvasWindows(pool, scope.workspaceId),
      listRecentCollaborationEpisodesSafely(pool, { workspaceId: scope.workspaceId }),
    ]);
    const windows = result.windows.length === 0
      ? 'No writable document or code editor windows are open.'
      : result.windows.map((win) => `• ${win.label} — ${win.kind} — id: ${win.id}`).join('\n');
    return [windows, formatCollaborationEpisodes(episodes)].filter(Boolean).join('\n\n');
  }
  if (name === 'canvas_append_window') {
    await requireWorkspaceMember(pool, {
      ...scope,
      roles: ['owner', 'admin', 'member'],
    });
    const result = await appendCollaborativeWindowText(pool, {
      workspaceId: scope.workspaceId,
      windowId: args.window_id,
      agentId,
      content: args.content,
    });
    return `Updated ${result.window.fileName || result.window.title || result.window.kind} on the shared canvas (revision ${result.revision}).`;
  }
  if (name === 'canvas_window_index') {
    await requireWorkspaceMember(pool, scope);
    const result = await listCanvasWindowIndex(pool, scope.workspaceId, {
      query: args.query,
      page: args.page,
      perPage: args.per_page ?? args.perPage,
    });
    if (result.total === 0) return 'No windows on the shared canvas yet.';
    const rows = result.windows.map((win) => `• ${win.label} — ${win.kind} — id: ${win.id}`).join('\n');
    const pages = Math.max(1, Math.ceil(result.total / result.perPage));
    return `${rows}\n(page ${result.page}/${pages}, ${result.total} total)`;
  }
  if (name === 'canvas_spawn_window') {
    await requireWorkspaceMember(pool, {
      ...scope,
      roles: ['owner', 'admin', 'member'],
    });
    const sub = scope.workspaceId ? await getSubAgentById(agentId, context).catch(() => null) : null;
    if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
      return `Error: ${sub.permission} sub-agents cannot open canvas windows. Use the \`report\` tool instead.`;
    }
    const result = await spawnCanvasWindow(pool, {
      workspaceId: scope.workspaceId,
      agentId,
      kind: args.kind,
      title: args.title,
      content: args.content,
      nearWindowId: args.near_window_id,
    });
    return `Opened ${result.window.kind} "${result.window.title}" on the shared canvas at (${result.window.x}, ${result.window.y}) — id: ${result.window.id} (revision ${result.revision}).`;
  }
  if (name === 'project_preview') {
    await requireWorkspaceMember(pool, {
      ...scope,
      roles: ['owner', 'admin', 'member'],
    });
    const sub = scope.workspaceId ? await getSubAgentById(agentId, context).catch(() => null) : null;
    if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
      return `Error: ${sub.permission} sub-agents cannot project previews. Use the \`report\` tool instead.`;
    }
    let preview;
    try {
      preview = buildPreviewWindow({
        title: args.title,
        previewType: args.preview_type,
        content: args.content,
      });
    } catch (error) {
      return `Error: ${error.message}`;
    }
    const result = await spawnCanvasWindow(pool, {
      workspaceId: scope.workspaceId,
      agentId,
      kind: preview.kind,
      title: preview.title,
      fileName: preview.fileName,
      html: preview.html,
      previewType: preview.previewType,
      nearWindowId: args.near_window_id,
    });
    return `Projected ${normalizePreviewType(args.preview_type)} preview "${result.window.title}" on the shared canvas at (${result.window.x}, ${result.window.y}) — id: ${result.window.id} (revision ${result.revision}).`;
  }
  throw new Error(`Unknown canvas collaboration tool: ${name}`);
}
