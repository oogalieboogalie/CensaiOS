// Spec 6: the fields a module window keeps on the canvas, and the patches
// that move it between states. Shared by the window and the server's
// make_module tool so both write the same shape.
//
//   status        'building' | 'ready' | 'error'
//   request       the plain-language request it was built from
//   manifest      { name, description, icon, size, permissions }
//   source        the module's HTML
//   versions      [{ source, manifest, note, by, at }], newest last
//   versionIndex  which version is showing (undo moves it back)
//   moduleData    the module's storage, shared live through the canvas doc
//   libraryId     set once it is saved to "My modules"

import { appendVersion, clampModuleSize } from './moduleFormat.js';

export const MODULE_WINDOW_KIND = 'module';

/** Patch for a finished build or edit. `versions` is the window's current list. */
export function builtModulePatch({ request, manifest, source, note = '', by = '', versions = [], keepSize = null }) {
  const nextVersions = appendVersion(versions, { source, manifest, note, by });
  const size = keepSize || clampModuleSize(manifest?.size);
  return {
    status: 'ready',
    request,
    title: manifest?.name || 'Module',
    manifest,
    source,
    versions: nextVersions,
    versionIndex: nextVersions.length - 1,
    w: size.w,
    h: size.h,
    error: null,
    buildPreview: null,
    buildChars: null,
    buildOwner: null,
    pendingInstruction: null,
  };
}

/** Show an earlier (or later) saved version without losing the others. */
export function versionPatch(win, index) {
  const versions = Array.isArray(win?.versions) ? win.versions : [];
  const target = versions[index];
  if (!target) return null;
  return { versionIndex: index, source: target.source, manifest: target.manifest, title: target.manifest?.name || win.title };
}

/** A fresh window for a request typed in the Add palette. */
export function newModuleWindowProps(request, buildOwner) {
  return {
    title: 'Building module',
    request,
    status: 'building',
    buildOwner,
    buildStartedAt: new Date().toISOString(),
  };
}

/** Props for opening a saved or template module. */
export function moduleWindowFromSaved({ name, request = '', manifest, source, libraryId = null }) {
  const versions = appendVersion([], { source, manifest, note: libraryId ? 'Opened from My modules' : 'Opened from a template' });
  return {
    title: name || manifest?.name || 'Module',
    request,
    status: 'ready',
    manifest,
    source,
    versions,
    versionIndex: 0,
    ...(libraryId ? { libraryId } : {}),
  };
}
