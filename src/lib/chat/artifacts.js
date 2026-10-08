// Spec 3 artifacts: big outputs leave the chat bubble and become windows.
// Pure helpers: what counts as an artifact and which window it opens as.
// `sendToCanvas.js` does the spawning.

export const ARTIFACT_LINE_THRESHOLD = 40;

export function lineCount(text) {
  const value = String(text || '');
  return value ? value.split('\n').length : 0;
}

/** A reply long enough to read better as its own document. */
export function isLongReply(text) {
  return lineCount(text) > ARTIFACT_LINE_THRESHOLD;
}

/** First line of a reply that reads like a title, for window names. */
export function titleFromText(text, fallback = 'Reply') {
  const first = String(text || '').split('\n').map(l => l.trim()).find(Boolean) || '';
  const clean = first.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
  if (!clean) return fallback;
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean;
}

const WRITE_TOOLS = new Set(['local_write_file', 'github_write_file', 'project_write', 'project_edit', 'project_multi_edit']);

function basename(path) {
  const parts = String(path || '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || String(path || '');
}

/** Files the agent wrote this turn, from the per-message tool activity. */
export function fileArtifacts(activity) {
  const seen = new Set();
  const out = [];
  for (const tool of activity?.tools || []) {
    if (!WRITE_TOOLS.has(tool?.name) || tool.ok === false) continue;
    const path = tool.summary?.path;
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const repo = tool.name === 'github_write_file' ? tool.summary?.target || null : null;
    out.push({
      type: 'file',
      path,
      name: basename(path),
      repo,
      added: Number.isFinite(tool.summary?.added) ? tool.summary.added : null,
      // Local and GitHub files open in the Code Editor; project files live
      // behind the project API, which the editor does not read yet.
      openable: tool.name === 'local_write_file' || Boolean(repo),
    });
  }
  return out;
}

/**
 * Window to spawn for an artifact: `{ kind, props, size }`.
 *   { type: 'text',  text, title }      → doc
 *   { type: 'code',  code, lang, title } → code_editor
 *   { type: 'image', src, alt }          → image
 *   { type: 'sketch', src, alt }         → sketchpad with the image placed
 *   { type: 'file',  path, repo }        → code_editor on the file
 */
export function windowForArtifact(artifact) {
  switch (artifact?.type) {
    case 'code':
      return {
        kind: 'code_editor',
        props: { title: artifact.title || (artifact.lang ? `${artifact.lang} snippet` : 'Snippet'), code: artifact.code, ...(artifact.lang ? { language: artifact.lang } : {}) },
        size: { w: 560, h: 420 },
      };
    case 'image':
      return { kind: 'image', props: { title: artifact.alt || 'Image', src: artifact.src }, size: { w: 420, h: 360 } };
    case 'sketch':
      return {
        kind: 'sketchpad',
        props: {
          title: artifact.alt || 'Sketch',
          state: { excalidraw: { elements: [{ id: `img-${Date.now()}`, type: 'image', href: artifact.src, x: 24, y: 24, w: 360, h: 270 }] } },
        },
        size: { w: 640, h: 480 },
      };
    case 'file':
      return {
        kind: 'code_editor',
        props: { title: basename(artifact.path), filePath: artifact.path, ...(artifact.repo ? { githubRepo: artifact.repo, isGithub: true } : {}) },
        size: { w: 560, h: 420 },
      };
    case 'text':
    default:
      return {
        kind: 'doc',
        props: { fileName: `${artifact?.title || 'Reply'}.md`, text: String(artifact?.text || '') },
        size: { w: 520, h: 480 },
      };
  }
}
