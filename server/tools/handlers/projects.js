import { getSubAgentById } from '../../memory.js';
import { recordProvenance } from '../../operational-intelligence/provenance.js';
import {
  openProject,
  listProjects,
  readProjectBrief,
  refreshProjectBrief,
  projectRead,
  projectFileOutline,
  projectWrite,
  projectEdit,
  projectList,
  writeReport,
  openSubAgentPR,
  logProjectActivity,
  isGithubProject
} from '../../workspaces.js';
import { resolveProjectForCall } from '../helpers.js';
import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import {
  grantManualProjectMembership,
  listWorkspaceAgentProjects,
} from '../../workspaces/projectMemberships.js';

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
      return `Opened project "${project.name}" at ${where}. Brief written to .team/PROJECT.md.${namingNote}`;
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
      const projects = await listProjects(agentId);
      if (projects.length === 0) return 'There are no shared projects yet. Use open_project to create one.';
      return projects.map(p =>
        `• ${p.name} — ${p.path || `github:${p.repo}`}${p.owner_agent_id ? ` [opened by ${p.owner_agent_id}]` : ''}`
      ).join('\n');
    }
    case 'read_brief': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const brief = await readProjectBrief(project);
      if (!brief) return `No brief for "${project.name}" yet. Use refresh_brief to generate one.`;
      return brief;
    }
    case 'refresh_brief': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      await refreshProjectBrief(project);
      await logProjectActivity(project.id, agentId, 'refresh_brief', null);
      return `Brief refreshed for "${project.name}".`;
    }
    case 'project_read': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      const branch = sub?.github_branch || undefined;
      const content = await projectRead(project, args.path, {
        branch,
        offset: args.offset,
        maxChars: args.max_chars ?? args.maxChars,
      });
      return content;
    }
    case 'project_file_outline': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      const branch = sub?.github_branch || undefined;
      return await projectFileOutline(project, args.path, {
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
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const branch = sub?.github_branch || undefined;
      const msg = `Update ${args.path} (by ${agentId})`;
      const where = await projectWrite(project, args.path, args.content, { branch, message: msg });

      if (args.__provenance) {
        await recordProvenance({
          workspace_id: project.name,
          agent_id: args.__provenance.agent_id,
          prompt: args.__provenance.prompt,
          model: args.__provenance.model,
          code_snippet: args.content,
          file_path: args.path,
          metadata: { project_id: project.id, branch }
        }).catch(err => console.error('[Provenance] Failed to record:', err.message));
      }

      await logProjectActivity(project.id, agentId, 'write', args.path);
      const onBranch = branch ? ` on \`${branch}\`` : '';
      return `Wrote ${args.path} in ${project.name}${onBranch}. → ${where}`;
    }
    case 'project_edit': {
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      if (sub && (sub.permission === 'reviewer' || sub.permission === 'researcher')) {
        return `Error: ${sub.permission} sub-agents cannot edit project files. Use the \`report\` tool instead.`;
      }
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const branch = sub?.github_branch || undefined;
      const msg = `Edit ${args.path} (by ${agentId})`;
      const where = await projectEdit(project, args.path, args.old_string, args.new_string, { branch, message: msg });
      await logProjectActivity(project.id, agentId, 'edit', args.path);
      const onBranch = branch ? ` on \`${branch}\`` : '';
      return `Edited ${args.path} in ${project.name}${onBranch}. → ${where}`;
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
      const branch = sub?.github_branch || undefined;
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

      const summary = [
        `Multi-edit: ${results.length}/${args.edits.length} files edited in ${project.name}.`,
        ...results,
        ...errors,
      ].join('\n');
      return summary;
    }
    case 'project_list': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      const branch = sub?.github_branch || undefined;
      const entries = await projectList(project, args.path || '.', { branch });
      if (entries.length === 0) return '(empty)';
      return entries.map(e => `[${e.type === 'dir' ? 'DIR' : 'FILE'}] ${e.name}`).join('\n');
    }
    case 'report': {
      const { project } = await resolveProjectForCall(agentId, args.project, context);
      const filePath = await writeReport(project, agentId, { title: args.title, content: args.content });
      return `Report filed: ${filePath}`;
    }
    case 'submit_pr': {
      const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
      if (!sub) return 'Only sub-agents can submit PRs.';
      if (sub.permission !== 'worker') return `Error: ${sub.permission} sub-agents cannot submit PRs — only workers.`;
      if (!sub.github_branch) return 'Error: you have no branch assigned. Was this project actually a GitHub project?';
      const { project } = await resolveProjectForCall(agentId, null, context);
      if (!isGithubProject(project)) return 'Error: this project is not GitHub-backed.';
      const pr = await openSubAgentPR(project, sub, { title: args.title, body: args.body });
      await logProjectActivity(project.id, agentId, 'pr', `${args.title} (#${pr.number})`);
      return `Opened PR #${pr.number}: ${pr.html_url}`;
    }

    default:
      throw new Error(`Unknown projects tool: ${name}`);
  }
}
