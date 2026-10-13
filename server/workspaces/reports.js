import fs from 'fs';
import path from 'path';
import { createIssue as ghCreateIssue } from '../github.js';
import {
  isGithubProject,
  mapProjectPathForRuntime,
  safeName,
} from './shared.js';
import { logProjectActivity } from './activity.js';

export async function writeReport(project, agentId, { title, content }) {
  if (isGithubProject(project)) {
    const body = `_filed by **${agentId}**_\n\n${content}`;
    const issue = await ghCreateIssue(project.repo, `[Report] ${title}`, body, ['report']);
    await logProjectActivity(project.id, agentId, 'report', `${title} (issue #${issue.number})`);
    return issue.html_url;
  }

  const reportsDir = path.join(mapProjectPathForRuntime(project.path), '.team', 'reports');
  await fs.promises.mkdir(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = safeName(title) || 'report';
  const filename = `${stamp}-${agentId}-${slug}.md`;
  const filePath = path.join(reportsDir, filename);
  const body = `# ${title}\n\n_by ${agentId} on ${new Date().toISOString()}_\n\n${content}\n`;
  await fs.promises.writeFile(filePath, body, 'utf8');
  await logProjectActivity(project.id, agentId, 'report', title);
  return filePath;
}
