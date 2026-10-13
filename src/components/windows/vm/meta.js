// Co-located window metadata. `npm run window:sync` wires it into the manifest.
export const windowMeta = {
  kind: 'vm',
  label: 'Virtual machine',
  componentName: 'VmWindow',
  componentPath: 'src/components/windows/vm/index.jsx',
  defaultSize: { w: 960, h: 640 },
  moduleMenu: { show: true, status: 'ready', order: 64, icon: 'Monitor', label: 'Virtual machine', hint: 'Show and control a VM you run, over VNC' },
  lab: { title: 'Virtual machine', props: {} },
};
