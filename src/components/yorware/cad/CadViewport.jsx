/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// three.js is large, so it loads with the first CAD window.
let scenePromise = null;
const loadScene = () => (scenePromise ||= import('./cadScene.js'));

const probe = (host, prop) => {
  const el = document.createElement('span');
  el.style.cssText = `position:absolute;visibility:hidden;color:var(${prop})`;
  host.appendChild(el);
  const color = getComputedStyle(el).color;
  el.remove();
  return color;
};

/**
 * The 3D view. `part` is the last build; `viewRef` gets { view(name), snapshot() }.
 * The camera frames the part again when `fitKey` (the recipe) changes, not when a size does.
 */
export function CadViewport({ part, fitKey, view = 'iso', viewRef, children }) {
  const hostRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const fitted = React.useRef(null);
  const [failed, setFailed] = React.useState(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    loadScene().then(({ createScene }) => {
      if (!live || !hostRef.current) return;
      try {
        sceneRef.current = createScene(hostRef.current);
        setReady(true);
      } catch (err) {
        setFailed(err?.message || 'this browser has no 3D drawing (WebGL)');
      }
    }, (err) => { scenePromise = null; if (live) setFailed(err?.message || String(err)); });
    return () => { live = false; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, []);

  React.useEffect(() => {
    const scene = sceneRef.current;
    const host = hostRef.current;
    if (!scene || !host) return;
    scene.setTheme({ faint: probe(host, '--ink-faint'), hairline: probe(host, '--hairline') });
    if (!part?.meshes) return;
    scene.setPart(part.meshes, part.bounds);
    if (part.ok && fitted.current !== fitKey) { scene.view(view); fitted.current = fitKey; }
  }, [ready, part, fitKey]);

  React.useImperativeHandle(viewRef, () => ({
    view: (name) => sceneRef.current?.view(name),
    snapshot: () => sceneRef.current?.snapshot(),
  }), []);

  return (
    <div className="hb-yc-view" ref={hostRef} data-no-drag>
      {failed && <div className="hb-yc-empty" role="status">The 3D view could not start: {failed}</div>}
      {children}
    </div>
  );
}
