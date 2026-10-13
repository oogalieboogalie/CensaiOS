// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover.
export const windowMeta = {
  kind: 'agentCompany',
  label: 'Agent Company',
  componentName: 'AgentCompanyWindow',
  componentPath: 'src/components/windows/agentCompany/index.jsx',
  defaultSize: { w: 760, h: 520 },
  moduleMenu: { show: true, status: 'ready', order: 62, icon: 'Gamepad', label: 'Agent Company', hint: 'Idle clicker. Grow a company of agents with everyone on the board' },
  lab: { title: 'Agent Company', props: {} },
};
