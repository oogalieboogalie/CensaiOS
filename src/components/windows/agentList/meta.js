// Agent list: every agent like a friends list, with presence and what each is doing (Add > Chat and agents).
export const windowMeta = {
  kind: 'agentList',
  label: 'Agent list',
  componentName: 'AgentListWindow',
  componentPath: 'src/components/windows/agentList/index.jsx',
  defaultSize: { w: 360, h: 640 },
  header: { title: 'Agent list', icon: 'Group' },
  moduleMenu: { show: true, status: 'ready', order: 11, icon: 'Group', label: 'Agent list', hint: 'Every agent like a friends list: who is online, where it runs and what it is doing' },
  lab: { title: 'Agent list', props: {} },
};
