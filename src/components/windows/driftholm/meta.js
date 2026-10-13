// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover.
export const windowMeta = {
  kind: 'driftholm',
  label: 'Driftholm',
  componentName: 'DriftholmWindow',
  componentPath: 'src/components/windows/driftholm/index.jsx',
  defaultSize: { w: 1040, h: 640 },
  moduleMenu: { show: true, status: 'ready', order: 65, icon: 'Gamepad', label: 'Driftholm', hint: 'A slow island game: chop, fish, fight cows and cook with everyone on the board' },
  lab: { title: 'Driftholm', props: {} },
};
