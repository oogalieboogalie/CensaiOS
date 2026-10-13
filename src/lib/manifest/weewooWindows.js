// WeeWoo: the company office where the board's agents show up as avatars.
// Kept in its own file like Censai Office. Pure data.

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
];
