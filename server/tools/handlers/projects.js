import { getSubAgentById } from '../../memory.js';
import { recordProvenance } from '../../operational-intelligence/provenance.js';
import {
  openProject,
  listProjects,
  projectRead,
  projectFileOutline,
  projectWrite,
  projectEdit,
  projectList,
  writeReport,
  logProjectActivity,
} from '../../workspaces.js';
import { briefNoteOnOpen, readBriefTool, refreshBriefTool } from './projectBriefs.js';
import { resolveProjectForCall } from '../helpers.js';
import { previewAfterWrite } from './projectWindow.js';
import { branchForRead, branchForWrite } from './writeBranch.js';
import { submitWorkerPr } from './workerPr.js';
import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import {
  grantManualProjectMembership,
  listWorkspaceAgentProjects,
} from '../../workspaces/projectMemberships.js';
import { noteToolFailure } from '../toolsLog.js';
import { ownerOnlyProjectRead, refuseProjectsOffBoard } from '../rbac/ownerOnlyReads.js';
import { PAST_PROJECT_ID, ensurePastProject, isPastLink, pastLinkToPath } from '../../workspaces/familyPast.js';

// The project and the path inside it for a call that names a file. A past://
// link names a file in the family's past (workspaces/familyPast.js), whatever
// `project` says, and goes through the same project access rules as any
// other project; resolveProjectForCall refuses any change to it.
async function projectAndPath(agentId, args, context) {
  if (!isPastLink(args.path)) {
    const { project } = await resolveProjectForCall(agentId, args.project, context);
    return { project, rel: args.path };
  }
  const rel = pastLinkToPath(args.path);
  await ensurePastProject(pool);
  const { project } = await resolveProjectForCall(agentId, PAST_PROJECT_ID, context);
  return { project, rel };
}

export async function handleProjectsTool(agentId, name, args, context = {}) {
  switch (name) {
    case 'open_project': {
      if (context.workspaceId) {
        if (!context.userId) throw new Error('Opening a project in a workspace requires an authenticated user.');
        await requireWorkspaceMember(pool, {
          userId: context.userId,
          workspaceId: context.workspaceId,
          roles: ['owner', 'admin', 'member'],
        });
      }
      const project = await openProject(agentId, {
        name: args.name,
        existingPath: args.existing_path,
        repo: args.repo,
        summary: args.summary,
      });
      if (context.workspaceId) {
        await grantManualProjectMembership(pool, {
          workspaceId: context.workspaceId,
          projectId: project.id,
          agentId,
          userId: context.userId,
          permission: 'work',
        });
      }
      // Be explicit: if the agent passed a repo, the project name is the bare
      // repo segment, not "owner/repo". Tell them so they pass the right value
      // to subsequent project_read / project_write / project_list calls.
      const where = project.path || (project.repo ? `github:${project.repo}` : '(no path)');
      const namingNote = (args.repo && project.name !== args.repo)
        ? ` Use project: "${project.name}" in subsequent calls (NOT "${args.repo}").`
        : '';
      return `Opened project "${project.name}" at ${where}. ${await briefNoteOnOpen(agentId, project)}${namingNote}`;
    }
    case 'list_projects': {
      if (context.workspaceId) {
        const memberships = await listWorkspaceAgentProjects(pool, {
          workspaceId: context.workspaceId,
          agentId,
        });
        if (memberships.length === 0) return 'No projects are authorized for you in this workspace.';
        return memberships.map((membership) =>
          `• ${membership.project_name} — ${membership.project_path || `github:${membership.project_repo}`}`
          + ` [${membership.permission}; ${membership.source_kind}]`
        ).join('\n');
      }
      // Off a board this computer's projects, and the folders they are in, are listed for the owner's agents only.
      await refuseProjectsOffBoard(context);
      const projects = await listProjects(agentId);
      if (projects.length === 0) return 'There are no shared projects yet. Use open_project to create one.';
      return projects.map(p =>
        `• ${p.name} — ${p.path || `github:${p.repo}`}${p.owner_agent_id ? ` [opened by ${p.owner_agent_id}]` : ''}`
      ).join('\n');
    }
    case 'read_brief': return readBriefTool(agentId, args, context);
    case 'refresh_brief': return refreshBriefTool(agentId, args, context);
    case 'project_read': {
      const { project, rel } = await projectAndPath(agentId, args, context);
      const refused = await ownerOnlyProjectRead(context, project, rel, { tool: name });
      if (refused) return `Error: ${refused}`;
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      const branch = await branchForRead({ agentId, sub, project, context });
      const content = await projectRead(project, rel, {
        branch,
        offset: args.offset,
        maxChars: args.max_chars ?? args.maxChars,
      });
      return content;
    }
    case 'project_file_outline': {
      const { project, rel } = await projectAndPath(agentId, args, context);
      const refused = await ownerOnlyProjectRead(context, project, rel, { tool: name });
      if (refused) return `Error: ${refused}`;
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      const branch = await branchForRead({ agentId, sub, project, context });
      return await projectFileOutline(project, rel, {
        branch,
        maxEntries: args.max_entries ?? args.maxEntries,
      });
    }
    case 'project_write': {
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      if (sub && sub.permission === 'reviewer') {
        return 'Error: reviewer sub-agents cannot write project files. Use the `report` tool instead.';
      }
      if (sub && sub.permission === 'researcher') {
        return 'Error: researcher sub-agents cannot write project files. Use the `report` tool to share findings.';
      }
      const { project } = await projectAndPath(agentId, args, context);
      const { branch, refused } = await branchForWrite({ agentId, sub, project, paths: [args.path], context });
      if (refused) return refused;
      const msg = `Update ${args.path} (by ${agentId})`;
      const where = await projectWrite(project, args.path, args.content, { branch, message: msg });

      if (args.__provenance) {
        await recordProvenance({
          workspace_id: args.__provenance.workspace_id,
          user_id: args.__provenance.user_id,
          agent_id: args.__provenance.agent_id,
          prompt: args.__provenance.prompt,
          model: args.__provenance.model,
          code_snippet: args.content,
          file_path: args.path,
          metadata: { project_id: project.id, project: project.name, branch }
        }).catch(err => noteToolFailure('provenance not recorded', { agentId: args.__provenance.agent_id }, err));
      }

      await logProjectActivity(project.id, agentId, 'write', args.path);
      const onBranch = branch ? ` on \`${branch}\`` : '';
      const shown = await previewAfterWrite(agentId, project, [args.path], context, { branch });
      return `Wrote ${args.path} in ${project.name}${onBranch}. → ${where}${shown}`;
    }
    case 'project_edit': {
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
        return `Error: ${sub.permission} sub-agents cannot edit project files. Use the \`report\` tool instead.`;
      }
      const { project } = await projectAndPath(agentId, args, context);
      const { branch, refused } = await branchForWrite({ agentId, sub, project, paths: [args.path], context });
      if (refused) return refused;
      const msg = `Edit ${args.path} (by ${agentId})`;
      const where = await projectEdit(project, args.path, args.old_string, args.new_string, { branch, message: msg });
      await logProjectActivity(project.id, agentId, 'edit', args.path);
      const onBranch = branch ? ` on \`${branch}\`` : '';
      const shown = await previewAfterWrite(agentId, project, [args.path], context, { branch });
      return `Edited ${args.path} in ${project.name}${onBranch}. → ${where}${shown}`;
    }
    case 'project_multi_edit': {
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
        return `Error: ${sub.permission} sub-agents cannot edit project files. Use the \`report\` tool instead.`;
      }
      if (!args.edits || !Array.isArray(args.edits) || args.edits.length === 0) {
        return 'Error: project_multi_edit requires an edits array with at least one entry.';
      }
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const { branch, refused } = await branchForWrite({ agentId, sub, project, paths: args.edits.map((edit) => edit?.path), context });
      if (refused) return refused;
      const results = [];
      const errors = [];

      // Process each edit sequentially — fail fast on first error
      for (const edit of args.edits) {
        if (!edit.path || edit.old_string === undefined || edit.new_string === undefined) {
          errors.push(`Invalid edit entry — missing path, old_string, or new_string: ${JSON.stringify(edit)}`);
          break;
        }
        try {
          const msg = `Multi-edit ${edit.path} (by ${agentId})`;
          const where = await projectEdit(project, edit.path, edit.old_string, edit.new_string, { branch, message: msg });
          await logProjectActivity(project.id, agentId, 'edit', edit.path);
          const onBranch = branch ? ` on \`${branch}\`` : '';
          results.push(`✓ ${edit.path}${onBranch} → ${where}`);
        } catch (err) {
          errors.push(`✗ ${edit.path}: ${err.message}`);
          break; // fail fast
        }
      }

      const edited = args.edits.slice(0, results.length).map((edit) => edit.path);
      const shown = results.length ? await previewAfterWrite(agentId, project, edited, context, { branch }) : '';
      const summary = [
        `Multi-edit: ${results.length}/${args.edits.length} files edited in ${project.name}.${shown}`,
        ...results,
        ...errors,
      ].join('\n');
      return summary;
    }
    case 'project_list': {
      const { project, rel } = await projectAndPath(agentId, args, context);
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      const branch = await branchForRead({ agentId, sub, project, context });
      const entries = await projectList(project, rel || '.', { branch });
      if (entries.length === 0) return '(empty)';
      return entries.map(e => `[${e.type === 'dir' ? 'DIR' : 'FILE'}] ${e.name}`).join('\n');
    }
    case 'report': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const filePath = await writeReport(project, agentId, { title: args.title, content: args.content });
      return `Report filed: ${filePath}`;
    }
    case 'submit_pr':
      return submitWorkerPr(agentId, args, context);

    default:
      throw new Error(`Unknown projects tool: ${name}`);
  }
}
