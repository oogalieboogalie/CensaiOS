/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { PromotedModuleWindow } from '../../modules/PromotedModuleWindow.jsx';
import { windowMeta } from './meta.js';
import { moduleManifest, moduleSource } from './module.js';

// Re-export co-located metadata so the discovery layer can read component + meta
// from a single import.
export { windowMeta };

// A deliberately tiny reference window. It proved the drop-in factory (one
// self-contained folder, registered without editing a central file by hand),
// and now it proves manifest v3 too: its code lives in module.js and runs in
// the sealed module sandbox, getting only what its manifest declares.
export function HelloFactoryWindow(props) {
  return <PromotedModuleWindow {...props} meta={windowMeta} manifest={moduleManifest} source={moduleSource} className="hb-hello-factory" />;
}

export default HelloFactoryWindow;
