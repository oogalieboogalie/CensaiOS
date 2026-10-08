/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { buildModuleDocument } from '../../lib/modules/moduleDocument.js';
import { getPresence } from '../../lib/modules/presenceRoster.js';
import { useModuleBridge } from './useModuleBridge.js';

/**
 * The sandbox. `allow-scripts` without `allow-same-origin` gives the module
 * an opaque origin: it can't read the app's cookies, storage, DOM or other
 * windows, and its CSP blocks the network unless the person granted it.
 * The document is rebuilt only when the code or the network grant changes;
 * storage and theme updates travel over the bridge, so typing never reloads it.
 */
export function ModuleFrame({ win, onUpdate, workspaceId, tokens, grants, requestPermission, onToast, onScriptError, title }) {
  const frameRef = React.useRef(null);
  const network = Boolean(win.manifest?.permissions?.includes('network') && grants.network === true);
  const snapshot = React.useRef({});
  snapshot.current = { tokens, storage: win.moduleData || {} };

  const doc = React.useMemo(() => buildModuleDocument(win.source, {
    tokens: snapshot.current.tokens,
    storage: snapshot.current.storage,
    presence: getPresence(),
    network,
  }), [win.source, network]);

  useModuleBridge({ frameRef, win, onUpdate, workspaceId, tokens, grants, requestPermission, onToast, onScriptError });

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
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      data-module-frame
      onLoad={onLoad}
    />
  );
}
