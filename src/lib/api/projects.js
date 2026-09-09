
export async function getCurrentProject() {
    const res = await fetch('/api/current-project');
    if (!res.ok) throw new Error('Failed to fetch current project');
    const data = await res.json();
    return data.project || null;
  }

export async function getProjects() {
    const res = await fetch('/api/projects');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to fetch projects');
    return Array.isArray(data?.projects) ? data.projects : [];
  }

export async function setCurrentProject({ path, name, summary }) {
    const res = await fetch('/api/current-project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name, summary }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to open project');
    return data.project || null;
  }

export async function openProject({ name, repo, path, summary }) {
    const res = await fetch('/api/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, repo, path, summary }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to add project');
    return data.project || null;
  }

export async function saveProjectIdea({ workspaceId, projectName, workItem, ideas, expansion, sourceTitle, assignee, priority }) {
    const res = await fetch('/api/project-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, projectName, workItem, ideas, expansion, sourceTitle, assignee, priority }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to save idea');
    return data;
  }

export async function createProjectHandoff({ workspaceId, title, text, assignee, sourceTitle, priority, sourceId }) {
    const res = await fetch('/api/project-handoffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, title, text, assignee, sourceTitle, priority, sourceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to create handoff');
    return data;
  }
