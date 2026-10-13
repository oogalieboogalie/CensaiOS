import { readProjectBrief } from '../../workspaces.js';
import pool from '../../db.js';
import { resolveAuthorizedWorkspaceProject } from '../../workspaces/projectAccess.js';
import { resolveChatModelConfig } from '../../aiGateway/index.js';
import {
  MODEL,
  FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS, DIRECT_SYNTHESIS_TOOLS
} from './shared.js';

export async function buildSubAgentSystemPrompt(sub, context = {}) {
  const lines = [];
  lines.push(`You are ${sub.name}, a ${sub.permission} sub-agent under ${sub.parent_id}.`);
  if (sub.role) lines.push(`Role: ${sub.role}`);
  if (sub.specialty) lines.push(`Specialty: ${sub.specialty}`);
  lines.push('');

  let project = null;
  if (sub.project_id && context.workspaceId === sub.workspace_id) {
    try {
      project = await resolveAuthorizedWorkspaceProject(pool, {
        workspaceId: context.workspaceId,
        agentId: sub.parent_id,
        projectIdentifier: sub.project_id,
        requiredPermission: 'read',
      });
    } catch {}
  }
  const isGithub = !!(project && project.repo);

  // Permission tier explanation, branded by project kind
  if (sub.permission === 'reviewer') {
    lines.push('You have READ-ONLY access. You cannot modify code.');
    if (isGithub) {
      lines.push('Use `report` to file findings — it opens a labelled GitHub issue your parent (and the human) will see.');
    } else {
      lines.push('Use `report` to file findings — they land in .team/reports/.');
    }
  } else if (sub.permission === 'researcher') {
    lines.push('You can READ project files and use `web_search`. You cannot modify code.');
    lines.push('Share findings via the `report` tool.');
  } else {
    if (isGithub) {
      lines.push(`You can READ, WRITE, and EDIT files in the project. Your branch is \`${sub.github_branch || '(no branch — error)'}\` — writes go there, never to the default branch.`);
      lines.push('');
      lines.push('For substantial coding work, prefer **Jules** (Google\'s autonomous coding agent) over editing files yourself:');
      lines.push('  • `jules_submit(prompt)` hands off a precise task to Jules. Jules works on YOUR branch, opens a PR automatically.');
      lines.push('  • Be SPECIFIC in the prompt — Jules is rigid. Name files, behaviors, edge cases, acceptance criteria.');
      lines.push('  • Poll with `jules_status(session)`. The PR link appears when ready.');
      lines.push('  • Check reviews with `pr_status(pr_number)` + `pr_comments(pr_number)`. If a reviewer commented, harvest the feedback and submit a follow-up Jules session to fix it. If they approved, call `merge_pr(pr_number)`.');
      lines.push('');
      lines.push('Edit files yourself only for small, surgical changes (one-line fixes, doc tweaks). Use `submit_pr` to PR your own work.');
    } else {
      lines.push('You can READ, WRITE, and EDIT files inside your bound project.');
    }
    lines.push('Use `report` for handoff notes or completion summaries.');
  }
  lines.push('');

  if (project) {
    if (isGithub) {
      lines.push(`Project: **${project.name}** — GitHub repo \`${project.repo}\`.`);
      if (sub.github_branch) lines.push(`Your branch: \`${sub.github_branch}\``);
    } else {
      lines.push(`Project: **${project.name}** at ${project.path}.`);
    }
    lines.push('Use `read_brief` to read PROJECT.md (directory tree, entry points, recent activity). It\'s your orientation document.');
    try {
      const brief = await readProjectBrief(project);
      if (brief) {
        lines.push('');
        lines.push('## PROJECT.md');
        lines.push(brief);
      }
    } catch {}
  } else {
    lines.push('You are not bound to a project. Ask your parent to recreate you with a project binding.');
  }

  lines.push('');
  const scoutish = /nano|scout|mapper|map|survey|outline/i.test(`${sub.name || ''} ${sub.role || ''} ${sub.specialty || ''}`);
  if (scoutish) {
    lines.push('Scout workflow: use `read_brief` and `project_list` first, then `project_file_outline` for large files. Only use `project_read` with small `max_chars` chunks for the specific sections you need. Your job is to hand back a compact map for the larger agent, not to ingest entire large files.');
  } else {
    lines.push('For large files, prefer `project_file_outline` before `project_read`. If you need content, read targeted chunks with `max_chars` and `offset` instead of loading the whole file.');
  }
  lines.push('Be concise. Do the work, file a report or write the change, then explain what you did.');
  return lines.join('\n');
}

export function getSubAgentModelConfig(sub) {
  const modelProvider = sub.model_provider || process.env.MODEL_PROVIDER || null;
  const modelName = sub.model_name || process.env.MODEL_NAME || process.env.MODEL || process.env.AI_MODEL || MODEL;
  const config = resolveChatModelConfig({ modelProvider, modelName });

  return {
    modelProvider: config.provider,
    modelName: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  };
}

export function summarizeToolActions(toolActions) {
  if (!toolActions.length) return 'No response generated.';
  const completedActions = toolActions.filter(action => action?.ok !== false);
  if (completedActions.length === 0) {
    const previews = toolActions.map(action => `${action.tool}: ${action.result_preview || 'failed'}`).slice(-4);
    return ['No requested action completed.', ...previews].join('\n');
  }
  const names = [...new Set(completedActions.map(action => action.tool).filter(Boolean))];
  const toolList = names.length ? ` (${names.join(', ')})` : '';
  const writeActions = completedActions.filter(action =>
    ['project_write', 'project_edit', 'project_multi_edit', 'local_write_file', 'github_write_file', 'report'].includes(action.tool)
  );
  const lines = [`I completed the requested work${toolList}.`];

  if (writeActions.length > 0) {
    const touched = writeActions
      .map(action => action.args?.path || action.args?.file_path || action.args?.title || action.result_preview)
      .filter(Boolean);
    if (touched.length > 0) {
      lines.push(`Changed: ${[...new Set(touched)].slice(0, 8).join(', ')}`);
    }
  }

  const usefulPreviews = completedActions
    .filter(action => !writeActions.includes(action))
    .map(action => `${action.tool}: ${String(action.result_preview || '').trim()}`)
    .filter(line => line.length > line.indexOf(':') + 2)
    .slice(-4);
  if (usefulPreviews.length > 0) {
    lines.push('', ...usefulPreviews);
  }
  return lines.join('\n');
}

export function shouldSynthesizeAfterToolBatch(actions, round) {
  if (actions.some(action => DIRECT_SYNTHESIS_TOOLS.has(action.tool))) return true;
  return round >= FORCE_TOOL_SYNTHESIS_AFTER_ROUNDS;
}

export function buildToolSynthesisPrompt(toolActions) {
  const lines = [
    'Answer the user using the tool results already provided above.',
    'Do not call more tools. Do not mention internal tool mechanics unless the user asked about them.',
    'Give a concise, useful final response that names the relevant files, folders, or findings from the tool results.',
    'If a result says APPROVAL_REQUIRED, clearly say the action is pending human approval and was not executed.',
  ];

  if (toolActions.length > 0) {
    lines.push('', 'Recent tool result previews:');
    for (const action of toolActions.slice(-8)) {
      const preview = String(action.result_preview || action.result || '').trim();
      lines.push(`- ${action.tool}: ${preview || 'completed'}`);
    }
  }

  return lines.join('\n');
}
