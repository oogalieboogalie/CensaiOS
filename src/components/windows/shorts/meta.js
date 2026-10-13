// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Media.
export const windowMeta = {
  kind: 'shorts',
  label: 'Shorts',
  componentName: 'ShortsWindow',
  componentPath: 'src/components/windows/shorts/index.jsx',
  defaultSize: { w: 400, h: 720 },
  sizeClass: 'fixed', // phone-shaped: a short is 9:16
  moduleMenu: { show: true, status: 'ready', order: 63, icon: 'Shorts', label: 'Shorts', hint: 'Scroll YouTube Shorts on the board' },
  lab: { title: 'Shorts', props: {} },
};
