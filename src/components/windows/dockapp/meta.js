// Co-located window metadata. `npm run window:sync` wires it into the manifest.
export const windowMeta = {
  kind: 'dockapp',
  label: 'Dock app',
  componentName: 'DockAppWindow',
  componentPath: 'src/components/windows/dockapp/index.jsx',
  // The app covers the whole body, so the header must sit above it, never over it.
  header: { mode: 'strip', fixed: true },
  defaultSize: { w: 960, h: 600 },
  moduleMenu: { show: true, status: 'ready', order: 62, icon: 'Dock', label: 'Dock app', hint: 'Put a real desktop app, like a game client or Discord, on the canvas' },
  lab: { title: 'Dock app', props: {} },
};
