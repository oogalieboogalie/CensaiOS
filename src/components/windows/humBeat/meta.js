// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Media.
export const windowMeta = {
  kind: 'humBeat',
  label: 'Hum a beat',
  componentName: 'HumBeatWindow',
  componentPath: 'src/components/windows/humBeat/index.jsx',
  defaultSize: { w: 900, h: 620 },
  moduleMenu: { show: true, status: 'ready', order: 63, icon: 'Music', label: 'Hum a beat', hint: 'Hum a melody, get the real notes, hear it as a beat' },
  lab: { title: 'Hum a beat', props: {} },
};
