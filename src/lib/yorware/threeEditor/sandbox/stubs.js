// Stand-ins for the parts of the three.js editor a sealed module can't run.
// Swapped in by import at bundle time (server/boot/threeEditorBundle.js), so
// the upstream files stay unchanged. Each one says so plainly instead.
import { UIPanel, UIText } from '../../../../../vendor/three-editor/js/libs/ui.js';

const SCRIPTS_OFF = 'Scripts are off in censaiOS: a scene on a shared board would run code written by someone else.';

function note(text) {
  const panel = new UIPanel();
  panel.setClass('yor-note');
  panel.add(new UIText(text));
  return panel;
}

/** The pop-up code editor (Script.js): it needs eval and CodeMirror. */
export function Script(editor) {
  const panel = new UIPanel();
  panel.setId('script');
  panel.setDisplay('none');
  editor.signals.editScript.add(() => { window.censai?.toast(SCRIPTS_OFF.split(':')[0] + '.'); });
  return panel;
}

/** The Script tab of an object's properties. */
export function SidebarScript() {
  const panel = note(SCRIPTS_OFF);
  panel.setDisplay('none');
  return panel;
}

/** Project > App (Publish): it downloads the editor's files from its own server. */
export function SidebarProjectApp() {
  return note('Publish is not part of the censaiOS 3D Editor. Use File > Export to save the scene as a file.');
}

/**
 * three-gpu-pathtracer loads from a CDN, so Realistic shading is left out:
 * picking it says so and keeps drawing the normal (solid) view.
 */
export class WebGLPathTracer {
  constructor(renderer) {
    this.renderer = renderer;
    this.samples = 0;
    this.filterGlossyFactor = 0;
    this.told = false;
  }
  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    if (!this.told) window.censai?.toast('Realistic shading is not in the censaiOS build; showing solid shading.');
    this.told = true;
  }
  updateCamera() {}
  updateEnvironment() {}
  updateMaterials() {}
  renderSample() { if (this.scene && this.camera) this.renderer.render(this.scene, this.camera); }
  reset() {}
}
