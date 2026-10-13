// Hello Factory, moved into a sealed module (manifest v3). It is the first
// built-in window that runs in the module sandbox instead of inside the app:
// it can only draw in its own window and save its note on the board, and an
// agent can change the note through its one tool. Guide:
// docs/modules/manifest-v3.md
export const moduleRequest = 'a tiny window that proves the window factory works';

export const moduleManifest = {
  manifest: 3,
  id: 'hello-factory',
  name: 'Hello Factory',
  version: '2.0.0',
  author: 'censaiOS',
  description: 'A tiny reference window that runs sealed in the module sandbox.',
  icon: 'Toolbox',
  size: { w: 440, h: 300 },
  permissions: ['storage'],
  state: { note: 'the line the window shows' },
  tools: [
    {
      name: 'set_note',
      description: 'Change the line Hello Factory shows.',
      input: { type: 'object', properties: { text: { type: 'string', description: 'The new line, up to 200 characters' } }, required: ['text'] },
    },
  ],
};

export const moduleSource = `<div class="stack hello">
  <div class="big">It works.</div>
  <p class="muted" id="note"></p>
  <code class="num faint">sealed module · manifest v3 · <span id="version"></span></code>
</div>
<style>
  .hello { gap: var(--space-3); }
  .hello .big { font-size: var(--text-md); }
  .hello code { font-size: var(--text-xs); background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--radius-lg); padding: var(--space-2) var(--space-3); }
</style>
<script>
  const DEFAULT_NOTE = 'This window was added by creating one folder, and it now runs sealed in its own box.';
  const $ = (id) => document.getElementById(id);
  function render() {
    $('note').textContent = censai.storage.get('note', DEFAULT_NOTE);
    $('version').textContent = 'v' + ((censai.manifest && censai.manifest.version) || '');
  }
  censai.tools.handle('set_note', ({ text }) => {
    const note = String(text).trim().slice(0, 200);
    if (!note) throw new Error('The note is empty.');
    censai.storage.set('note', note);
    render();
    return { note };
  });
  censai.storage.onChange(render);
  render();
</script>`;
