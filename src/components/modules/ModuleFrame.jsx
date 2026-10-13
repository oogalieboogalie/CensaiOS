/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { buildModuleDocument } from '../../lib/modules/moduleDocument.js';
import { getPresence } from '../../lib/modules/presenceRoster.js';
import { cspHosts, declares } from '../../lib/modules/manifestV3.js';
import { useModuleBridge } from './useModuleBridge.js';

/**
 * The sandbox. `allow-scripts` without `allow-same-origin` gives the module
 * an opaque origin: it can't read the app's cookies, storage, DOM or other
 * windows, and its CSP blocks the network except the sites its manifest
 * names, once the person allowed it. The document is rebuilt only when the
 * code or the network grant changes; storage and theme updates travel over
 * the bridge, so typing never reloads it.
 *
 * `frameAllow` is set only by built-in sealed windows (never from the board):
 * 'downloads' (the host saves a file the module hands it, see
 * useModuleBridge), 'modals' (the browser's own confirm and alert boxes) and
 * 'local-files' (read blob:/data: addresses) and 'wasm' (compile WebAssembly
 * inside the box, for file decoders).
 */
export const FRAME_ALLOW = Object.freeze({ modals: 'allow-modals' });

export function ModuleFrame({ win, manifest, onUpdate, workspaceId, tokens, grants, requestPermission, onToast, onScriptError, onRefused, bridgeRef, title, frameAllow = [] }) {
  const frameRef = React.useRef(null);
  const networkAllowed = declares(manifest, 'network') && grants.network === true;
  const network = networkAllowed ? cspHosts(manifest) : false;
  const networkKey = network ? network.join(' ') : '';
  const snapshot = React.useRef({});
  snapshot.current = {
    tokens,
    storage: declares(manifest, 'storage') ? (win.moduleData || {}) : {},
    presence: declares(manifest, 'presence') ? getPresence() : [],
    manifest,
  };

  const localFiles = frameAllow.includes('local-files');
  const wasm = frameAllow.includes('wasm');
  const sandbox = ['allow-scripts', 'allow-forms', ...frameAllow.map(name => FRAME_ALLOW[name]).filter(Boolean)].join(' ');
  const doc = React.useMemo(() => buildModuleDocument(win.source, {
    tokens: snapshot.current.tokens,
    storage: snapshot.current.storage,
    presence: snapshot.current.presence,
    manifest: snapshot.current.manifest,
    network: networkKey ? networkKey.split(' ') : false,
    localFiles,
    wasm,
  }), [win.source, networkKey, localFiles, wasm]);

  const bridge = useModuleBridge({ frameRef, win, manifest, onUpdate, workspaceId, tokens, grants, requestPermission, onToast, onScriptError, onRefused, frameAllow });
  const { resetReady } = bridge;
  React.useEffect(() => { resetReady(); }, [doc, resetReady]);
  if (bridgeRef) bridgeRef.current = bridge;

  const onLoad = () => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    target.postMessage({ __hbHost: 1, type: 'theme', tokens: snapshot.current.tokens }, '*');
    target.postMessage({ __hbHost: 1, type: 'storage', data: snapshot.current.storage }, '*');
  };

  return (
    <iframe
      ref={frameRef}
      className="hb-module-frame"
      title={title || 'Module'}
      srcDoc={doc}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      data-module-frame
      data-module-sealed="true"
      onLoad={onLoad}
    />
  );
}
