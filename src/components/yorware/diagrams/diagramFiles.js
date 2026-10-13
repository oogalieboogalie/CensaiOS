// Export and import for a YorWare Diagrams window. Everything runs in the
// browser through Excalidraw's own exporters; nothing goes to a server.
import { liveElements, scenePatch } from '../../../lib/yorware/diagramModel.js';
import { pickFile } from '../../../lib/office/officeFiles.js';

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

function scene(api) {
  if (!api) throw new Error('The drawing is still opening.');
  const elements = liveElements(api.getSceneElements());
  if (!elements.length) throw new Error('Draw something first.');
  return { elements, appState: api.getAppState(), files: api.getFiles() };
}

export function diagramFormats(kit, api) {
  const image = (s) => ({ ...s.appState, exportBackground: true, exportWithDarkMode: false });
  return [
    { ext: 'png', label: 'Picture (PNG)', hint: 'The whole drawing on its background', build: async () => {
      const s = scene(api);
      return kit.exportToBlob({ elements: s.elements, appState: image(s), files: s.files, mimeType: 'image/png', exportPadding: 24, getDimensions: (w, h) => ({ width: w * 2, height: h * 2, scale: 2 }) });
    } },
    { ext: 'svg', label: 'Vector picture (SVG)', hint: 'Sharp at any size; opens in browsers, Figma, Inkscape', build: async () => {
      const s = scene(api);
      const svg = await kit.exportToSvg({ elements: s.elements, appState: image(s), files: s.files, exportPadding: 24 });
      return new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    } },
    { ext: 'excalidraw', label: 'Excalidraw file', hint: 'Opens at excalidraw.com or back in YorWare Diagrams', build: async () => {
      const s = scene(api);
      return new Blob([kit.serializeAsJSON(s.elements, s.appState, s.files, 'local')], { type: 'application/json' });
    } },
  ];
}

/** Open an .excalidraw file (or a PNG/SVG exported with its drawing inside) in place of this drawing. */
export async function importDiagram(kit, win, onUpdate) {
  const file = await pickFile('.excalidraw,.json,application/json,image/png,image/svg+xml');
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is over 8 MB, more than a board diagram holds.');
  let data;
  try {
    data = await kit.loadFromBlob(file, null, null);
  } catch {
    throw new Error(`"${file.name}" has no drawing in it. Open an .excalidraw file, or a PNG or SVG saved with its drawing.`);
  }
  const patch = scenePatch(win, { elements: data.elements, files: data.files, background: data.appState?.viewBackgroundColor });
  onUpdate?.({ ...patch, title: file.name.replace(/\.(excalidraw|json|png|svg)$/i, '') || win.title });
}
