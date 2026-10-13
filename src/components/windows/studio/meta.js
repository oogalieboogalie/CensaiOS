// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Media.
export const windowMeta = {
  kind: 'studio',
  label: 'Studio',
  componentName: 'StudioWindow',
  componentPath: 'src/components/windows/studio/index.jsx',
  defaultSize: { w: 1120, h: 700 },
  moduleMenu: { show: true, status: 'ready', order: 62, icon: 'Music', label: 'Studio', hint: 'Make music: tracks, synth, piano roll, mixer and effects' },
  lab: { title: 'Studio', props: {} },
};
