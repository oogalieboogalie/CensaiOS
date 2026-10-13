/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { PromotedModuleWindow } from '../../modules/PromotedModuleWindow.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { windowMeta } from './meta.js';
import { loadModuleSource, moduleManifest } from './module.js';

export { windowMeta };

// The editor is 2.6 MB, so it loads the first time a 3D Editor window opens.
// Once loaded it is kept, so later windows start with it: the sandbox is
// handed its document once and never swapped mid-load.
let sourcePromise = null;
let loadedSource = null;
const loadSource = () => (sourcePromise ||= loadModuleSource().then((text) => { loadedSource = text; return text; }, (err) => { sourcePromise = null; throw err; }));

// Saving files the person exports, the editor's own confirm boxes ("delete
// this?"), reading the files it opens (blob: addresses inside the box), and
// the WebAssembly decoders three.js uses for compressed models.
const FRAME_ALLOW = ['downloads', 'modals', 'local-files', 'wasm'];

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// YorWare 3D Editor: the three.js editor (MIT) running sealed in the module
// sandbox. It sees only its own scene on the board and the four buttons its
// manifest gives agents. Part of the YorWare Suite (docs/specs/13-yorware-suite.md).
export function YorThreeEditorWindow(props) {
  const [source, setSource] = React.useState(loadedSource);
  React.useEffect(() => {
    if (loadedSource) return undefined;
    let live = true;
    loadSource().then(
      (text) => { if (live) setSource(text); },
      (err) => { if (live) setSource(`<p class="muted">The 3D Editor could not load: ${escapeHtml(err?.message || err)}</p>`); },
    );
    return () => { live = false; };
  }, []);
  if (!source) {
    return (
      <>
        <WindowTitle icon={<Icon.CubeEdit size={14} />} label={windowMeta.label} />
        <div className="hb-module" data-module-window data-module-status="loading">
          <p className="hb-module-loading">Loading the 3D Editor…</p>
        </div>
      </>
    );
  }
  return (
    <PromotedModuleWindow
      {...props}
      meta={windowMeta}
      manifest={moduleManifest}
      source={source}
      frameAllow={FRAME_ALLOW}
      className="hb-yor-3d"
    />
  );
}

export default YorThreeEditorWindow;
