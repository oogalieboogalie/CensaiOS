// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under People (social canvas).
export const windowMeta = {
  kind: 'social',
  label: 'Social',
  componentName: 'SocialWindow',
  componentPath: 'src/components/windows/social/index.jsx',
  defaultSize: { w: 720, h: 640 },
  moduleMenu: { show: true, status: 'ready', order: 66, icon: 'Group', label: 'Social', hint: 'Follow boards and friends, see what they and their agents are building, show off your best boards' },
  lab: { title: 'Social', props: {} },
};
