// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover.
export const windowMeta = {
  kind: 'racetrack',
  label: 'Racetrack',
  componentName: 'RacetrackWindow',
  componentPath: 'src/components/windows/racetrack/index.jsx',
  defaultSize: { w: 760, h: 520 },
  moduleMenu: { show: true, status: 'ready', order: 61, icon: 'Car', label: 'Racetrack', hint: 'Draw a loop with the pen and drive a car around it' },
  lab: { title: 'Racetrack', props: {} },
};
