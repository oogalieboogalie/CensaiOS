// Co-located window metadata. `npm run window:sync` wires it into the manifest.
export const windowMeta = {
  kind: 'apiBar',
  label: 'API Bar',
  componentName: 'ApiBarWindow',
  componentPath: 'src/components/windows/apiBar/index.jsx',
  defaultSize: { w: 940, h: 640 },
  moduleMenu: { show: true, status: 'ready', order: 19, icon: 'Plug', label: 'API Bar', hint: 'One door for every censaiOS API: a doorman passes your note to the right one and brings the answer back, signed' },
  lab: { title: 'API Bar', props: {} },
};
