// YorWare 3D Editor: the three.js editor (MIT, vendor/three-editor, upstream
// files unchanged) packed into one sealed module. The editor is a page of ES
// modules that expects its own server; a sealed module is one HTML document
// with inline code and no network. So this bundles the editor, three.js from
// node_modules (same release, r186) and our glue
// (src/lib/yorware/threeEditor/sandbox) into one script, and hands it to the
// app as `virtual:yorware-three-editor`, a lazy chunk that loads the first
// time a 3D Editor window opens. Nothing loads from anyone else's server.
//
// The few places the editor reaches past its own page are swapped here, by
// import, without editing upstream files: Storage.js (IndexedDB) becomes the
// board, the script editor and Publish (need eval and a server) become a
// note, and the GPU path tracer (loaded from a CDN) is left out.
import fs from 'fs';
import path from 'path';

export const THREE_EDITOR_MODULE_ID = 'virtual:yorware-three-editor';
const RESOLVED_ID = `\0${THREE_EDITOR_MODULE_ID}`;

const SANDBOX = ['src', 'lib', 'yorware', 'threeEditor', 'sandbox'];

// Upstream file -> the glue that stands in for it.
const SWAPS = {
  'Storage.js': 'boardStorage.js',
  'Script.js': 'stubs.js',
  'Sidebar.Script.js': 'stubs.js',
  'Sidebar.Project.App.js': 'stubs.js',
};

// Exact edits to upstream text, checked so a new upstream release can't
// silently skip one. The example projects are games that need scripts.
const PATCHES = [
  { file: 'Menubar.File.js', find: /const examples = \[[\s\S]*?\];/, replace: 'const examples = [];' },
  // Draco export needs an encoder the editor loads from a CDN.
  { file: 'Menubar.File.js', find: /option\.setTextContent\( 'DRC' \);/, replace: "option.setTextContent( 'DRC' ); option.setDisplay( 'none' );" },
  // Each shape's settings panel is loaded by a computed file name, which a
  // bundler can't follow; name them all so they are packed in.
  { file: 'Sidebar.Geometry.js', find: /await import\( `\.\/Sidebar\.Geometry\.\$\{ geometry\.type \}\.js` \)/, replace: geometryPanels },
];

function geometryPanels(jsDir) {
  const names = fs.readdirSync(jsDir).map(f => /^Sidebar\.Geometry\.(\w+Geometry)\.js$/.exec(f)?.[1]).filter(Boolean);
  const loaders = names.map(n => `${n}: () => import( './Sidebar.Geometry.${n}.js' )`).join(', ');
  return `await ( { ${loaders} }[ geometry.type ] || ( () => Promise.reject( new Error( 'No settings for ' + geometry.type ) ) ) )()`;
}

function editorDir(root) { return path.join(root, 'vendor', 'three-editor'); }
function sandboxDir(root) { return path.join(root, ...SANDBOX); }

/** The editor's stylesheet with its dark-mode rules keyed to the board's theme. */
export function editorCss(root) {
  const upstream = fs.readFileSync(path.join(editorDir(root), 'css', 'main.css'), 'utf8');
  const frame = fs.readFileSync(path.join(sandboxDir(root), 'frame.css'), 'utf8');
  // The sandbox can't see the app's theme through prefers-color-scheme, so
  // those blocks follow a class the glue sets from the theme tokens.
  const themed = upstream.replace(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/g, ':root.yor-dark {');
  return `${frame}\n${themed}`;
}

function bundlerPlugin(root) {
  const jsDir = path.join(editorDir(root), 'js');
  const glue = sandboxDir(root);
  return {
    name: 'yorware-three-editor-swaps',
    resolveId(source, importer) {
      if (source === 'three-gpu-pathtracer') return path.join(glue, 'stubs.js');
      if (!importer || !source.startsWith('.')) return null;
      const target = path.resolve(path.dirname(importer), source);
      const swap = path.dirname(target) === jsDir && SWAPS[path.basename(target)];
      return swap ? path.join(glue, swap) : null;
    },
    load(id) {
      if (id.endsWith('.svg')) return `export default ${JSON.stringify(fs.readFileSync(id, 'utf8'))};`;
      return null;
    },
    transform(code, id) {
      for (const patch of PATCHES) {
        if (path.resolve(id) !== path.join(jsDir, patch.file)) continue;
        if (!patch.find.test(code)) throw new Error(`three.js editor: patch for ${patch.file} no longer matches upstream`);
        const replacement = typeof patch.replace === 'function' ? patch.replace(jsDir) : patch.replace;
        code = code.replace(patch.find, () => replacement);
      }
      return code;
    },
  };
}

// Inline <script> text can't contain a closing tag or an HTML comment opener.
function scriptSafe(code) {
  return code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

/** Build the whole sealed module source: the editor's styles and one script. */
export async function buildThreeEditorSource(root) {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: path.join(sandboxDir(root), 'entry.js'),
    cwd: root,
    platform: 'browser',
    plugins: [bundlerPlugin(root)],
    // Some three.js loaders locate their WebAssembly helpers from their own
    // address; inside the box there is none, so give them one that can never
    // load (Draco and KTX2 files stay unsupported, everything else parses).
    transform: { define: { 'import.meta.url': JSON.stringify('https://three-editor.invalid/examples/jsm/loaders/') } },
    logLevel: 'silent',
  });
  const { output } = await bundle.generate({ format: 'iife', minify: true, codeSplitting: false });
  await bundle.close();
  const signals = fs.readFileSync(path.join(editorDir(root), 'js', 'libs', 'signals.min.js'), 'utf8');
  const code = scriptSafe(`${signals}\n${output[0].code}`);
  const css = editorCss(root).replace(/<\/(style)/gi, '');
  return `<style>${css}</style>\n<script>${code}</script>`;
}

/** Vite plugin: `import('virtual:yorware-three-editor')` gives the source string. */
export function threeEditorPlugin(root) {
  let cached = null;
  return {
    name: 'yorware-three-editor',
    resolveId(id) { return id === THREE_EDITOR_MODULE_ID ? RESOLVED_ID : null; },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      cached ||= buildThreeEditorSource(root).catch((err) => { cached = null; throw err; });
      return `export default ${JSON.stringify(await cached)};`;
    },
    handleHotUpdate({ file }) {
      if (file.includes(`${path.sep}${SANDBOX.join(path.sep)}${path.sep}`)) cached = null;
    },
  };
}
