// project_window: an agent opens or points at a window for the person it is
// chatting with, and every project file write shows up live in the chat's
// preview window (see server/collaboration/chatPreview.js).
import fs from 'fs';
import pool from '../../db.js';
import { getFile as ghGetFile } from '../../github.js';
import { getSubAgentById } from '../../memory.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { isGithubProject, resolveInsideProject } from '../../workspaces/shared.js';
import { resolveProjectForCall } from '../helpers.js';
import { followFileInPreview, openRunDevBeside, pointAtWindow } from '../../collaboration/chatPreview.js';
import { previewKindForPath } from '../../collaboration/chatPreviewShape.js';
import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';
import { ownerOnlyKind } from '../../security/ownerOnlyFiles.js';
import { OWNER_ONLY_FILE, secretRepoPath } from '../../security/secretFiles.js';
import { PREVIEW_OFF_BOARD } from '../../../shared/files/fileProblems.js';

const log = createLogger('chat-preview');

// The preview sits on the shared board, so it never shows a file only this
// computer's owner opens (server/security/ownerOnlyFiles.js), nor one a page
// pulls in, whoever's agent asks: a .env, a key file, anything in a hidden
// folder, a link out of the project.

async function ownerOnly(project, relPath) {
  if (isGithubProject(project)) return secretRepoPath(relPath);
  const target = resolveInsideProject(project.path, relPath);
  return Boolean(await ownerOnlyKind({ target, base: resolveInsideProject(project.path, '.') }));
}

/** A reader for a project's raw file text (local folder or GitHub branch), never one only the owner opens. */
export function projectFileReader(project, branch) {
  return async (relPath) => {
    if (await ownerOnly(project, relPath)) throw Object.assign(new Error('owner only'), { code: OWNER_ONLY_FILE });
    return isGithubProject(project)
      ? ghGetFile(project.repo, relPath, branch)
      : fs.promises.readFile(resolveInsideProject(project.path, relPath), 'utf8');
  };
}

/**
 * Called after project_write / project_edit / project_multi_edit. Returns a
 * short line for the tool result ('' when nothing is shown), never throws.
 */
export async function previewAfterWrite(agentId, project, paths, context = {}, { branch, deps } = {}) {
  if (!context.workspaceId || !context.windowId) return '';
  const target = [...(paths || [])].reverse().find((p) => previewKindForPath(p));
  if (!target) return '';
  try {
    const shown = await followFileInPreview({
      workspaceId: context.workspaceId, chatWindowId: context.windowId, agentId, project,
      filePath: target, readFile: projectFileReader(project, branch),
    }, deps);
    if (!shown) return '';
    if (shown.status === 'dev') return ' Run dev is open for this project, so the app reloads there on its own.';
    return ` ${shown.status === 'opened' ? 'Opened' : 'Refreshed'} the live preview beside this chat (${shown.window.fileName}, window id ${shown.window.id}).`;
  } catch (error) {
    log.warn('preview after write failed', { workspaceId: context.workspaceId, code: safeErrorCode(error) });
    return '';
  }
}

export async function handleProjectWindowTool(agentId, _name, args = {}, context = {}) {
  const workspaceId = String(context.workspaceId || '').trim();
  if (!workspaceId || !context.userId) return 'Error: project_window needs a shared board (sign in and open a board).';
  await requireWorkspaceMember(pool, { workspaceId, userId: context.userId, roles: ['owner', 'admin', 'member'] });
  const sub = await getSubAgentById(agentId, context).catch(() => null);
  if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
    return `Error: ${sub.permission} sub-agents cannot open windows. Use the \`report\` tool instead.`;
  }
  const action = String(args.action || 'show_file');
  const chatWindowId = context.windowId || null;
  if (action === 'point') {
    if (!args.window_id && !args.title) return 'Error: point needs window_id or title.';
    const win = await pointAtWindow(workspaceId, {
      chatWindowId, windowId: args.window_id ? String(args.window_id) : null, title: args.title, agentId, userId: context.userId, note: args.note,
    });
    return win ? `Pointed the person at "${win.title || win.fileName || win.kind}" (it glows and their view slides to it).` : `Error: no window ${args.window_id ? `with id ${args.window_id}` : `called "${args.title}"`} is on the board.`;
  }
  const { project } = await resolveProjectForCall(agentId, args.project, context);
  if (action === 'run_app') {
    if (!project?.path) return 'Error: run_app needs a project in a folder on this computer (GitHub-only projects cannot run here).';
    const opened = await openRunDevBeside(workspaceId, { chatWindowId, agentId, userId: context.userId, folder: project.path, title: `Run dev · ${project.name}` });
    if (!opened) return 'Error: the board is not running, so Run dev could not open.';
    return opened.created
      ? `Opened Run dev for ${project.name} beside this chat. It starts the dev server and shows the app in a Browser window; edits reload there.`
      : `Run dev for ${project.name} is already open; pointed the person at it.`;
  }
  if (action !== 'show_file') return 'Error: action must be show_file, point or run_app.';
  if (!args.path) return 'Error: show_file needs path (a file in the project).';
  if (!previewKindForPath(args.path)) return 'Error: the preview shows .html, .svg, .md and image files (css/js refresh the page that uses them).';
  if (!chatWindowId) return 'Error: show_file works from a chat window on the board.';
  if (await ownerOnly(project, String(args.path)).catch(() => false)) return `Error: ${PREVIEW_OFF_BOARD}`;
  const shown = await followFileInPreview({
    workspaceId, chatWindowId, agentId, project, filePath: String(args.path),
    readFile: projectFileReader(project, sub?.github_branch || undefined),
  });
  if (!shown) return `Error: could not show ${args.path} (is the file there, and is the board open?).`;
  if (shown.status === 'dev') return 'Run dev is open for this project; pointed the person at it.';
  return `${shown.status === 'opened' ? 'Opened' : 'Refreshed'} the live preview of ${shown.window.fileName} beside this chat (window id ${shown.window.id}). It refreshes each time you write the file.`;
}
