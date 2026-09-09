
export async function searchFiles(query) {
    const res = await fetch(`/api/files/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Search failed');
    return await res.json();
  }


export async function getBacklinks(path) {
    const res = await fetch(`/api/files/backlinks?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Backlinks fetch failed');
    return await res.json();
  }

export async function createDirectory(parentPath, name) {
    const res = await fetch('/api/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: parentPath, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to create folder');
    return data;
  }

export async function createFile(filePath, content = '') {
    const res = await fetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to create file');
    return data;
  }
