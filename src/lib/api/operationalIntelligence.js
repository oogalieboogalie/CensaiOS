const BASE = '/api/operational-intelligence';

async function requestOperational(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Operational intelligence request failed');
  return data;
}

export function openOperationalTodoList({ workspaceId, windowId, artifactId, title, items }) {
  return requestOperational('/todos/open', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, windowId, artifactId, title, seedItems: items || [] }),
  });
}

export function refreshOperationalTodoList({ workspaceId, listArtifactId }) {
  const params = new URLSearchParams({ workspaceId });
  return requestOperational(`/todos/${encodeURIComponent(listArtifactId)}?${params.toString()}`);
}

export function createOperationalTodo({ workspaceId, listArtifactId, item, order }) {
  return requestOperational(`/todos/${encodeURIComponent(listArtifactId)}/items`, {
    method: 'POST',
    body: JSON.stringify({ workspaceId, item, order }),
  });
}

export function updateOperationalTodo({ workspaceId, listArtifactId, itemArtifactId, patch }) {
  return requestOperational(
    `/todos/${encodeURIComponent(listArtifactId)}/items/${encodeURIComponent(itemArtifactId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ workspaceId, patch }),
    }
  );
}

export function dispatchOperationalTodo({ workspaceId, listArtifactId, itemArtifactId }) {
  return requestOperational(
    `/todos/${encodeURIComponent(listArtifactId)}/items/${encodeURIComponent(itemArtifactId)}/dispatch`,
    {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }
  );
}

export function pullMergedOperationalTodos({ remote, branch } = {}) {
  return requestOperational('/sync/pull-merged', {
    method: 'POST',
    body: JSON.stringify({ remote, branch }),
  });
}
