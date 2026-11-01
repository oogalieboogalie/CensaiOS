// WeeWoo: the company office where the board's agents show up as avatars,
// and the Agent list (every agent like a friends list). Kept in its own
// file like Censai Office. Pure data.

export const WEEWOO_WINDOW_MANIFESTS = [
  {
    kind: 'weewoo',
    canvasType: 'weewoo',
    label: 'WeeWoo',
    componentName: 'WeeWooWindow',
    componentPath: 'src/components/windows/weewoo/index.jsx',
    defaultSize: { w: 1100, h: 720 },
    header: { title: 'WeeWoo', icon: 'Group' },
    lab: {"title":"My company","props":{"title":"My company","demo":true}},
    moduleMenu: {"show":true,"status":"ready","order":12,"icon":"Group","label":"WeeWoo","hint":"Your agents as avatars, working in departments"},
  },
  {
    kind: 'agentList',
    canvasType: 'agentList',
    label: 'Agent list',
    componentName: 'AgentListWindow',
    componentPath: 'src/components/windows/agentList/index.jsx',
    defaultSize: { w: 360, h: 640 },
    lab: {"title":"Agent list","props":{}},
    moduleMenu: {"show":true,"status":"ready","order":11,"icon":"Group","label":"Agent list","hint":"Every agent like a friends list: who is online, where it runs and what it is doing"},
  },
];
