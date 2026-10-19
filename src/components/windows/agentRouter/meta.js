// Message Router (Alex's diagram 03): one shared line the board's agents
// talk on, and a router that sends each part of a request to the right
// agent with its memory and the right template. Listed under Add > Work.
export const windowMeta = {
  kind: 'agentRouter',
  label: 'Message Router',
  componentName: 'AgentRouterWindow',
  componentPath: 'src/components/windows/agentRouter/index.jsx',
  defaultSize: { w: 900, h: 640 },
  header: { title: 'Message Router', icon: 'Send' },
  moduleMenu: { show: true, status: 'ready', order: 68, icon: 'Send', label: 'Message Router', hint: 'Say what you need in one line. The router cuts it into jobs and hands each to the right agent, with its memory and a template' },
  lab: { title: 'Message Router', props: {} },
};
