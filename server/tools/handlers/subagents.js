import {
  createSubAgent,
  getSubAgents,
  deleteSubAgent,
  updateSubAgent,
  createAgentTask,
  getAgent,
  getSubAgentById
} from '../../memory.js';
import {
  isGithubProject,
  ensureSubAgentBranch,
  mirrorSubAgentToDisk,
  removeSubAgentFromDisk
} from '../../workspaces.js';
import { findReusableSubAgents, formatReuseNotice } from './subagentReuse.js';
import { REVIEW_SPECIALTY_PROMPTS } from './subagentPrompts.js';
import { resolveModelDefaults } from './subagentModelDefaults.js';
import { handleDataBoxTool } from './dataBox.js';
import pool from '../../db.js';
import { resolveAuthorizedWorkspaceProject } from '../../workspaces/projectAccess.js';
import { noteToolFailure } from '../toolsLog.js';

export async function handleSubagentTool(agentId, name, args, context = {}) {
  switch (name) {
    case 'create_sub_agent': {
      let project = null;
      if (args.project) {
        try {
          project = await resolveAuthorizedWorkspaceProject(pool, {
            workspaceId: context.workspaceId,
            agentId,
            projectIdentifier: args.project,
            requiredPermission: 'read',
          });
        } catch {
          return `No authorized project named "${args.project}" found. Use open_project first.`;
        }
      }

      const agentClass = args.class || (String(args.preset || '').toLowerCase() === 'mapper' ? 'scout' : undefined);
      const tier = args.tier || (String(args.preset || '').toLowerCase() === 'mapper' ? 'nano' : undefined);
      const { modelProvider, modelName } = resolveModelDefaults(tier, agentClass, args.model);

      if (!args.force_new) {
        const existing = await getSubAgents(agentId, context);
        const reusable = findReusableSubAgents(existing, {
          name: args.name,
          class: agentClass,
          permission: args.permission,
          projectId: project?.id,
          specialty: args.specialty,
        });
        if (reusable.length > 0) {
          const bestMatch = reusable[0].sub;
          if (project && bestMatch.project_id !== project.id) {
            await updateSubAgent(bestMatch.id, { project_id: project.id }, context);
            try { await mirrorSubAgentToDisk(agentId, { ...bestMatch, project_id: project.id }); } catch {}
            return `Sub-agent "${bestMatch.name}" (${bestMatch.id}) already exists. Bound to project "${project.name}" (updated).`;
          }
          return formatReuseNotice(reusable);
        }
      }

      // Inherit parent agent's directory/repo scopes and project binding
      let parentScopes = null;
      let parentProjectId = null;
      try {
        const parentSub = await getSubAgentById(agentId, context);
        const parentAgent = parentSub ? null : await getAgent(agentId);
        parentScopes = parentSub ? parentSub.tool_scopes?.scopes : parentAgent?.tool_scopes?.scopes;
        parentProjectId = parentSub ? parentSub.project_id : parentAgent?.project_id;
      } catch (err) {
        noteToolFailure('could not load parent scopes for a sub-agent', { agentId }, err);
      }

      const tool_scopes = {
        mode: args.tools ? 'custom' : 'default',
        tools: args.tools || undefined,
        scopes: parentScopes || undefined,
      };

      let sub = await createSubAgent(agentId, {
        name: args.name,
        role: args.role,
        specialty: args.specialty,
        permission: args.permission || (agentClass === 'builder' ? 'worker' : agentClass === 'scout' || agentClass === 'sentry' ? 'researcher' : agentClass === 'auditor' ? 'reviewer' : 'worker'),
        projectId: project?.id || parentProjectId || null,
        modelProvider,
        modelName,
        preset: args.preset,
        class: agentClass || null,
        reviewSpecialty: args.review_specialty || null,
        systemPromptInject: args.review_specialty ? REVIEW_SPECIALTY_PROMPTS[args.review_specialty] : null,
        tool_scopes,
      }, context);

      // If this is a GitHub project and a worker sub-agent, give them their own branch
      let branchNote = '';
      if (project && isGithubProject(project) && sub.permission === 'worker') {
        try {
          const branch = await ensureSubAgentBranch(project, sub);
          if (branch) {
            await updateSubAgent(sub.id, { github_branch: branch }, context);
            sub.github_branch = branch;
            branchNote = ` Branch \`${branch}\` ready in ${project.repo}.`;
          }
        } catch (e) {
          branchNote = ` (branch creation failed: ${e.message})`;
        }
      }

      try { await mirrorSubAgentToDisk(agentId, sub); } catch {}
      const projectMsg = project ? `, bound to ${project.name}` : ' (unbound — no project assigned)';
      const classNote = agentClass ? ` Class: ${agentClass}.` : '';
      const specialtyNote = sub.review_specialty ? ` Specialty: ${sub.review_specialty}.` : '';
      return `Created sub-agent "${sub.name}" (${sub.id}). Permission: ${sub.permission}${projectMsg}.${classNote}${specialtyNote}${branchNote}`;
    }
    case 'list_sub_agents': {
      const subs = await getSubAgents(agentId, context);
      if (subs.length === 0) return 'No sub-agents yet. Use create_sub_agent to create one.';
      return subs.map(s => {
        const proj = s.project_id ? ` [project: ${s.project_id}]` : ' [unbound]';
        return `• ${s.name} (${s.id}) — ${s.permission || 'worker'}${proj}${s.role ? ` — ${s.role}` : ''}`;
      }).join('\n');
    }
    case 'remove_sub_agent': {
      const subs = await getSubAgents(agentId, context);
      const match = subs.find(s =>
        s.name.toLowerCase() === args.name.toLowerCase() ||
        s.id === args.name.toLowerCase()
      );
      if (!match) return `No sub-agent found matching "${args.name}".`;
      await deleteSubAgent(match.id, context);
      try { await removeSubAgentFromDisk(agentId, match); } catch {}
      return `Deactivated sub-agent "${match.name}".`;
    }
    case 'submit_agent_task': {
      const subs = await getSubAgents(agentId, context);
      const match = subs.find(s =>
        s.name.toLowerCase() === args.sub_agent.toLowerCase() ||
        s.id === args.sub_agent.toLowerCase()
      );
      if (!match) return `Error: No sub-agent found matching "${args.sub_agent}". Create them first or double check spelling.`;

      let projectId = match.project_id || null;
      let projectName = args.project || null;
      if (args.project) {
        const project = await resolveAuthorizedWorkspaceProject(pool, {
          workspaceId: context.workspaceId,
          agentId,
          projectIdentifier: args.project,
          requiredPermission: 'read',
        });
        projectId = project.id;
        projectName = project.name;
      }

      const task = await createAgentTask({
        parentId: agentId,
        assigneeId: match.id,
        projectId,
        project: projectName || args.project || (match.project_id ? match.project_id : null),
        title: args.title,
        prompt: args.prompt,
        priority: args.priority || 'normal',
        wakeId: context.agentWakeId || null,
        workspaceId: context.workspaceId,
        userId: context.userId,
      });
      return `Successfully queued task "${task.title}" (ID: ${task.id}) for sub-agent "${match.name}"${projectName ? ` scoped to project "${projectName}"` : ''}. The task worker will execute it asynchronously.`;
    }

    // ─── SUB-AGENT DATA BOXES (scratchpad) ───────────────────────
    case 'scratchpad_write':
    case 'scratchpad_read':
    case 'scratchpad_clear':
      return handleDataBoxTool(agentId, name, args, context);

    default:
      throw new Error(`Unknown subagent tool: ${name}`);
  }
}
