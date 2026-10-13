// What a new YorWare Suite window starts with when added from the Add
// palette: a PDF window with no pages, ready for a file, an empty photo
// library, and a Layout window with no pages, which offers its ready-made
// starting points, an empty diagram, and an empty 3D Viewer that shows its
// first model's name, and an empty 3D Editor scene.
import { makePdfDoc } from './pdfModel.js';
import { makePhotoLib } from './photoLibModel.js';
import { makeLayoutDoc } from './layoutModel.js';
import { makeDiagram } from './diagramModel.js';
import { makeModelScene } from './modelBoard.js';

export const YORWARE_STARTERS = Object.freeze({
  yorPdf: { title: 'Untitled PDF', ...makePdfDoc() },
  yorPhotos: { title: 'Photos', ...makePhotoLib() },
  yorLayout: { title: 'Untitled layout', ...makeLayoutDoc() },
  yorDiagrams: { title: 'Untitled diagram', ...makeDiagram() },
  yor3d: { title: '3D Viewer', ...makeModelScene() },
  yorThreeEditor: { title: 'Untitled scene' },
  // A CAD window opens on its ready-made parts.
  yorCad: { title: 'Untitled part' },
});
