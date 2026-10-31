
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

/** Makes a new file; one already there by that name is refused, never emptied. */
export async function createFile(filePath, content = '') {
    const res = await fetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content, create: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to create file');
    return data;
  }

/** Folders the "Mount to" picker can offer: places, or one folder's subfolders. */
export async function listFolders(path = '') {
    const res = await fetch(`/api/files/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // An answer with no places (offline, signed out) says nothing about what the picker may offer.
      const offers = Array.isArray(data?.places);
      throw Object.assign(new Error(data?.error || 'Could not list folders'), {
        places: offers ? data.places : null,
        openProjectsOnly: offers ? Boolean(data.openProjectsOnly) : null,
      });
    }
    return data;
  }
