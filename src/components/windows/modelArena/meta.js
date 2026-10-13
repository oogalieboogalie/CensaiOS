// Model arena: one request to up to four models, streamed side by side with
// speed and cost. Listed under Add > Chat and agents.
export const windowMeta = {
  kind: 'modelArena',
  label: 'Model arena',
  componentName: 'ModelArenaWindow',
  componentPath: 'src/components/windows/modelArena/index.jsx',
  defaultSize: { w: 1120, h: 680 },
  header: { title: 'Model arena', icon: 'Activity' },
  moduleMenu: { show: true, status: 'ready', order: 8, icon: 'Activity', label: 'Model arena', hint: 'Send one request to up to four models and watch them race: speed, tokens and cost side by side' },
  lab: { title: 'Model arena', props: {} },
};
