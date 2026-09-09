// Co-located window metadata — the ONLY place this window declares itself.
// `npm run window:sync` reads this file and wires the window into the central
// manifest + registry automatically. No central file is hand-edited.
export const windowMeta = {
  kind: 'helloFactory',
  label: 'Hello Factory',
  componentName: 'HelloFactoryWindow',
  componentPath: 'src/components/windows/helloFactory/index.jsx',
  defaultSize: { w: 440, h: 300 },
  lab: {
    title: 'Hello Factory',
    props: { note: 'This window was added by creating one folder and running window:sync.' },
  },
};
