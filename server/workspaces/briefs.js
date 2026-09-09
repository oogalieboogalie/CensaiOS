import fs from 'fs';
import path from 'path';
import {
  generateLocalBrief,
  generateGithubBrief,
} from '../projectBrief.js';
import {
  tryGetFile as ghTryGetFile,
  putFile as ghPutFile,
} from '../github.js';
import {
  isGithubProject,
  mapProjectPathForRuntime,
} from './shared.js';
import { getRecentActivity } from './activity.js';

export async function refreshProjectBrief(project) {
  if (!project) return null;
  const activity = await getRecentActivity(project.id, 10);

  if (isGithubProject(project)) {
    const content = await generateGithubBrief({ project, activity });
    await ghPutFile(
      project.repo,
      '.team/PROJECT.md',
      content,
      `Refresh PROJECT.md (by ${project.owner_agent_id})`,
      undefined, // default branch
    );
    return `https://github.com/${project.repo}/blob/HEAD/.team/PROJECT.md`;
  }

  // Local
  const briefPath = path.join(mapProjectPathForRuntime(project.path), '.team', 'PROJECT.md');
  const content = await generateLocalBrief({ project, activity });
  await fs.promises.mkdir(path.dirname(briefPath), { recursive: true });
  await fs.promises.writeFile(briefPath, content, 'utf8');
  return briefPath;
}

export async function readProjectBrief(project) {
  if (!project) return null;
  if (isGithubProject(project)) {
    return ghTryGetFile(project.repo, '.team/PROJECT.md');
  }
  try {
    return await fs.promises.readFile(path.join(mapProjectPathForRuntime(project.path), '.team', 'PROJECT.md'), 'utf8');
  } catch {
    return null;
  }
}
