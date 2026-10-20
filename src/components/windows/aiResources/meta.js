// Co-located window metadata. `npm run window:sync` wires it into the manifest.
export const windowMeta = {
  kind: 'aiResources',
  label: 'AI resources',
  componentName: 'AiResourcesWindow',
  componentPath: 'src/components/windows/aiResources/index.jsx',
  defaultSize: { w: 920, h: 660 },
  moduleMenu: { show: true, status: 'ready', order: 67, icon: 'Activity', label: 'AI resources', hint: 'Every AI key and sign-in you have, what each one runs, what it spent and what is left' },
  lab: { title: 'AI resources', props: {} },
};
