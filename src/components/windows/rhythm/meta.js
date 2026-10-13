// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover.
export const windowMeta = {
  kind: 'rhythmRun',
  label: 'Rhythm Run',
  componentName: 'RhythmRunWindow',
  componentPath: 'src/components/windows/rhythm/index.jsx',
  defaultSize: { w: 820, h: 580 },
  moduleMenu: { show: true, status: 'ready', order: 64, icon: 'Music', label: 'Rhythm Run', hint: 'Hit the notes in time. Built-in songs or chart your own track' },
  lab: { title: 'Rhythm Run', props: {} },
};
