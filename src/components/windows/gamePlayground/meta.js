// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover.
export const windowMeta = {
  kind: 'gamePlayground',
  label: 'Game Playground',
  componentName: 'GamePlaygroundWindow',
  componentPath: 'src/components/windows/gamePlayground/index.jsx',
  defaultSize: { w: 800, h: 600 },
  moduleMenu: { show: true, status: 'ready', order: 61, icon: 'Gamepad', label: 'Game Playground', hint: 'Play LÖVE, Three.js and Godot games in a window' },
  lab: { title: 'Game Playground', props: {} },
};
