// WeeWoo: the board's agents as avatars working in a company (Add > Chat and agents).
export const windowMeta = {
  kind: 'weewoo',
  label: 'WeeWoo',
  componentName: 'WeeWooWindow',
  componentPath: 'src/components/windows/weewoo/index.jsx',
  defaultSize: { w: 1100, h: 720 },
  header: { title: 'WeeWoo', icon: 'Group' },
  moduleMenu: { show: true, status: 'ready', order: 12, icon: 'Group', label: 'WeeWoo', hint: 'Your agents as avatars, working in departments' },
  lab: { title: 'My company', props: { title: 'My company', demo: true } },
};
