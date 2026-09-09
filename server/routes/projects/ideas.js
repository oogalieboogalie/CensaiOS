import fs from 'fs';
import path from 'path';
import { createAgentTask } from '../../memory/tasks.js';
import { getSubAgents } from '../../memory/subagents.js';
import {
  readCurrentProject, formatIdeaDate, slugify, escapeMd
} from './shared.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';

export async function createProjectIdea(req, res) {
  const { projectName, workItem, ideas = [], expansion = '', sourceTitle, assignee, priority = 'normal' } = req.body || {};
  const currentProject = await readCurrentProject();
  let scope;
  try {
    const workspace = await resolveWorkspaceContext(pool, {
      userId: req.session.userId,
      workspaceId: req.body?.workspaceId || null,
    });
    scope = { userId: req.session.userId, workspaceId: workspace.id };
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }

  if (!currentProject?.path) {
    return res.status(400).json({ error: 'Open a local project before saving ideas.' });
  }

  const cleanProject = String(projectName || currentProject.name || 'Project').trim();
  const cleanWorkItem = String(workItem || sourceTitle || 'Idea').trim();
  const cleanIdeas = Array.isArray(ideas)
    ? ideas.map(item => String(item || '').trim()).filter(Boolean)
    : [];

  if (!cleanWorkItem) {
    return res.status(400).json({ error: 'A work item label is required.' });
  }

  if (cleanIdeas.length === 0 && !String(expansion || '').trim()) {
    return res.status(400).json({ error: 'Add bullets or an expansion before saving.' });
  }

  try {
    const runtimeProjectPath = resolveProjectPathForRuntime(currentProject.path);
    const ideatedOn = formatIdeaDate();
    const tag = `[${cleanProject}] - ${cleanWorkItem} - Ideated on ${ideatedOn}`;
    const ideasDir = path.join(runtimeProjectPath, '.team', 'ideas');
    await fs.promises.mkdir(ideasDir, { recursive: true });

    const baseName = `${new Date().toISOString().slice(0, 10)}-${slugify(cleanProject)}-${slugify(cleanWorkItem)}`;
    let filePath = path.join(ideasDir, `${baseName}.md`);
    let counter = 2;
    while (fs.existsSync(filePath)) {
      filePath = path.join(ideasDir, `${baseName}-${counter++}.md`);
    }

    const cleanAssignee = String(assignee || '').trim();
    const body = [
      `# ${tag}`,
      '',
      `Project: ${cleanProject}`,
      `Work item: ${cleanWorkItem}`,
      `Ideated on: ${ideatedOn}`,
      `Source: ${sourceTitle || 'Idea Pad'}`,
      `Assignee: ${cleanAssignee || 'unassigned'}`,
      `Priority: ${priority || 'normal'}`,
      '',
      '## Raw Bullets',
      cleanIdeas.length ? cleanIdeas.map(item => `- ${escapeMd(item)}`).join('\n') : '_No raw bullets captured._',
      '',
      '## Expanded Idea',
      escapeMd(expansion) || '_No expansion captured yet._',
      '',
      '## Agent Breadcrumbs',
      '- Read this before changing code for the tagged work item.',
      '- Start with the raw bullets, then use the expanded idea as planning context.',
      '- Prefer the smallest scoped implementation that advances this work item.',
      '',
    ].join('\n');

    await fs.promises.writeFile(filePath, body, 'utf8');

    let task = null;
    let taskSkipped = null;
    if (cleanAssignee) {
      const subs = await getSubAgents(cleanAssignee, scope);
      const chosen = subs.find(sub => ['worker', 'coder'].includes(String(sub.permission || '').toLowerCase()))
        || subs[0];
      if (chosen) {
        const promptParts = [
          `Take this Idea Pad note from capture to implementation planning for "${cleanWorkItem}".`,
          '',
          `Idea note: ${filePath}`,
          `Project path: ${currentProject.path}`,
          `Project: ${cleanProject}`,
          `Source: ${sourceTitle || 'Idea Pad'}`,
          '',
          'Raw bullets:',
          cleanIdeas.length ? cleanIdeas.map(item => `- ${escapeMd(item)}`).join('\n') : '- No raw bullets captured.',
        ];

        const cleanExpansion = escapeMd(expansion);
        if (cleanExpansion) {
          promptParts.push('', 'Expanded idea:', cleanExpansion);
        }

        promptParts.push(
          '',
          'Handoff contract:',
          '- Read the idea note before changing code.',
          '- Turn the idea into the smallest useful implementation or a concrete next-step report.',
          '- Leave a report or update the idea note with decisions, blockers, and verification before marking complete.'
        );

        task = await createAgentTask({
          parentId: cleanAssignee,
          assigneeId: chosen.id,
          projectId: chosen.project_id || currentProject.projectId || currentProject.name || null,
          project: currentProject.name || currentProject.path,
          title: `Idea: ${cleanWorkItem}`,
          prompt: promptParts.join('\n'),
          priority,
          ...scope,
        });
      } else {
        taskSkipped = `No active sub-agent exists under ${cleanAssignee}. Idea note was still written.`;
      }
    }

    res.json({
      tag,
      path: filePath,
      relativePath: path.relative(runtimeProjectPath, filePath).replace(/\\/g, '/'),
      task,
      taskSkipped,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}
