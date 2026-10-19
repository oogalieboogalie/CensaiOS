// Legion: a team of agents that keeps working on a goal until Echo says OK.
// Listed under Add > Chat and agents.
export const windowMeta = {
  kind: 'legion',
  label: 'Legion',
  componentName: 'LegionWindow',
  componentPath: 'src/components/windows/legion/index.jsx',
  defaultSize: { w: 1180, h: 720 },
  header: { title: 'Legion', icon: 'Group' },
  moduleMenu: { show: true, status: 'ready', order: 9, icon: 'Group', label: 'Legion', hint: 'A team of agents that works until it is done: plan, build front and back at once, join them, check in a browser, fix, commit' },
  lab: { title: 'Legion', props: {} },
};
