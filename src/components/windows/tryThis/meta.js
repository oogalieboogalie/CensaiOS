// Co-located window metadata. `npm run window:sync` wires it into the
// manifest. Only the board's first wake-up opens this window, so it stays out
// of the Add menu.
export const windowMeta = {
  kind: 'tryThis',
  label: 'Try this',
  componentName: 'TryThisWindow',
  componentPath: 'src/components/windows/tryThis/index.jsx',
  defaultSize: { w: 400, h: 340 },
  moduleMenu: { show: false },
  lab: { title: 'Try this', props: { tried: { sample: true } } },
};
