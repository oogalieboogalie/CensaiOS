// Spec 6 client for /api/modules: streamed generation and edits, a module's
// agent.ask, templates and "My modules".

async function jsonOrThrow(res, fallback) {
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = new Error(body?.error || fallback);
    err.code = body?.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Generate a module (request) or change one (instruction + source).
 * onDelta(text) gets the reply so far as it streams. Resolves to
 * { manifest, source, model }.
 */
export async function streamModule(body, { onDelta, signal } = {}) {
  const res = await fetch('/api/modules/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) await jsonOrThrow(res, 'The module could not be built.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let result = null;
  const handle = (line) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'delta') { text += event.text || ''; onDelta?.(text); }
    if (event.type === 'retry') { text = ''; onDelta?.(text, { retry: event.attempt }); }
    if (event.type === 'done') result = event;
    if (event.type === 'error') {
      const err = new Error(event.error || 'The module could not be built.');
      err.code = event.code;
      err.status = event.status;
      throw err;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(handle);
  }
  handle(buffer);
  if (!result) throw new Error('The build stopped before the module was finished.');
  return result;
}

export async function askFromModule({ prompt, moduleName, workspaceId }) {
  const res = await fetch('/api/modules/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ prompt, moduleName, workspaceId }),
  });
  const body = await jsonOrThrow(res, 'The agent could not answer.');
  return body.text || '';
}

export async function fetchModuleTemplates() {
  const body = await jsonOrThrow(await fetch('/api/modules/templates', { credentials: 'include' }), 'Templates are unavailable.');
  return body.templates || [];
}

export async function fetchSavedModules() {
  const body = await jsonOrThrow(await fetch('/api/modules/library', { credentials: 'include' }), 'Your modules are unavailable.');
  return body.modules || [];
}

export async function fetchSavedModule(id) {
  const body = await jsonOrThrow(await fetch(`/api/modules/library/${encodeURIComponent(id)}`, { credentials: 'include' }), 'That module could not be opened.');
  return body.module;
}

export async function saveModuleToLibrary({ id, request, manifest, source }) {
  const res = await fetch('/api/modules/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, request, manifest, source }),
  });
  const body = await jsonOrThrow(res, 'The module could not be saved.');
  return body.module;
}
