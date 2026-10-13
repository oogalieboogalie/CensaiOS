// The sealed 3D Editor's start-up: the three.js editor's index.html script,
// minus what a sealed module can't do (service worker, loading a project
// from a web address), plus the board. Bundled by
// server/boot/threeEditorBundle.js. Order matters: shims.js runs first.
import './shims.js';
import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Editor } from '../../../../../vendor/three-editor/js/Editor.js';
import { Viewport } from '../../../../../vendor/three-editor/js/Viewport.js';
import { Toolbar } from '../../../../../vendor/three-editor/js/Toolbar.js';
import { Script } from '../../../../../vendor/three-editor/js/Script.js';
import { Player } from '../../../../../vendor/three-editor/js/Player.js';
import { Sidebar } from '../../../../../vendor/three-editor/js/Sidebar.js';
import { Menubar } from '../../../../../vendor/three-editor/js/Menubar.js';
import { Resizer } from '../../../../../vendor/three-editor/js/Resizer.js';
import { AnimationResizer } from '../../../../../vendor/three-editor/js/AnimationResizer.js';
import { Animation } from '../../../../../vendor/three-editor/js/Animation.js';
import font from '../../../../../vendor/three-editor/fonts/helvetiker_bold.typeface.json';
import translateIcon from '../../../../../vendor/three-editor/images/translate.svg';
import rotateIcon from '../../../../../vendor/three-editor/images/rotate.svg';
import scaleIcon from '../../../../../vendor/three-editor/images/scale.svg';
import { connectBoard } from './boardStorage.js';
import { handleAgentTools } from './agentTools.js';
import { startAutosave } from './autosave.js';

// Files the editor asks for by address, served from inside the bundle.
const fontUrl = URL.createObjectURL(new Blob([JSON.stringify(font)], { type: 'application/json' }));
THREE.DefaultLoadingManager.setURLModifier((url) => (/helvetiker_bold\.typeface\.json$/.test(url) ? fontUrl : url));
const ICONS = { translate: translateIcon, rotate: rotateIcon, scale: scaleIcon };
const svgData = (text) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;

const editor = new Editor();
window.editor = editor;
window.THREE = THREE;
THREE.ObjectLoader.registerGeometry('TextGeometry', TextGeometry);

// Agents' buttons first: the board asks which tools are handled when the page loads.
handleAgentTools(editor);

const viewport = new Viewport(editor);
document.body.appendChild(viewport.dom);
const toolbar = new Toolbar(editor);
document.body.appendChild(toolbar.dom);
for (const img of toolbar.dom.querySelectorAll('img')) {
  const name = /images\/(\w+)\.svg$/.exec(img.getAttribute('src') || '')?.[1];
  if (ICONS[name]) img.src = svgData(ICONS[name]);
}
for (const Part of [Script, Player, Sidebar, Menubar, Resizer, Animation, AnimationResizer]) {
  document.body.appendChild(new Part(editor).dom);
}

editor.signals.animationPanelChanged.add((height) => {
  const visible = height !== false;
  viewport.dom.classList.toggle('with-animation', visible);
  toolbar.dom.classList.toggle('with-animation', visible);
  viewport.dom.style.bottom = visible ? `${height}px` : '';
  toolbar.dom.style.bottom = visible ? `${height + 20}px` : '';
  editor.signals.windowResize.dispatch();
});

connectBoard(editor);
startAutosave(editor);

document.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer.types[0] === 'text/plain') return; // the outliner's own drag
  if (event.dataTransfer.items) editor.loader.loadItemList(event.dataTransfer.items);
  else editor.loader.loadFiles(event.dataTransfer.files);
});

window.addEventListener('resize', () => editor.signals.windowResize.dispatch());
editor.signals.windowResize.dispatch();
