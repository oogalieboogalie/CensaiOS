export const canvasCollaborationTools = [
  {
    type: 'function',
    function: {
      name: 'canvas_list_writable_windows',
      description: 'List document and code editor windows in the current shared canvas. Use this before appending so you target the exact visible window id.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_append_window',
      description: 'Append bounded text to an existing document or code editor window in the current shared canvas. This updates the visible workspace for every connected member; it cannot replace or delete existing text.',
      parameters: {
        type: 'object',
        properties: {
          window_id: { type: 'string', description: 'Exact id returned by canvas_list_writable_windows' },
          content: { type: 'string', description: 'Text to append, up to 8192 UTF-8 bytes' },
        },
        required: ['window_id', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_spawn_window',
      description: 'Open a new document or code editor window on the shared canvas next to the current view. Use this to put visible results, notes, or code in front of the user; the window appears for every connected member without a reload.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'Window kind: doc or code_editor' },
          title: { type: 'string', description: 'Window title (shown on the canvas, max 120 chars)' },
          content: { type: 'string', description: 'Initial text/code, up to 8192 UTF-8 bytes' },
          near_window_id: { type: 'string', description: 'Optional id of an existing window to place the new one next to (from canvas_window_index)' },
        },
        required: ['kind', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_preview',
      description: 'Project visual code straight onto the shared canvas in a preview window, so the user sees the result without hunting through the file tree. Agnostic projector: set preview_type to html, threejs, react, css, or tailwind and pass the source in content; the server wraps it into a standalone document and opens it next to the current view for every connected member.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Window title shown on the canvas (max 120 chars)' },
          preview_type: { type: 'string', description: 'Visual type to project: html, threejs, react, css, or tailwind. Unknown future types pass through as raw HTML.', enum: ['html', 'threejs', 'react', 'css', 'tailwind'] },
          content: { type: 'string', description: 'Source to render: full HTML document or fragment for html/tailwind, JavaScript module code (with THREE in scope) for threejs, JSX for react, stylesheet for css. Up to 65536 UTF-8 bytes after wrapping.' },
          near_window_id: { type: 'string', description: 'Optional id of an existing window to place the preview next to (from canvas_window_index)' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_window_index',
      description: 'Paginated alphabetical index of canvas windows (id, kind, label). Query and page through it instead of dumping full canvas state into context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional case-insensitive label filter' },
          page: { type: 'number', description: 'Page number, starting at 1' },
          per_page: { type: 'number', description: 'Rows per page, max 50' },
        },
      },
    },
  },
];
