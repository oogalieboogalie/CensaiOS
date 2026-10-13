// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover (spec 11).
export const windowMeta = {
  kind: 'asteroids',
  label: 'Asteroids',
  componentName: 'AsteroidsWindow',
  componentPath: 'src/components/windows/asteroids/index.jsx',
  defaultSize: { w: 720, h: 540 },
  moduleMenu: { show: true, status: 'ready', order: 60, icon: 'Gamepad', label: 'Asteroids', hint: 'Arcade shooter. Play together on the board' },
  lab: { title: 'Asteroids', props: {} },
};
