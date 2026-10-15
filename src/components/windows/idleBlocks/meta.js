// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover.
export const windowMeta = {
  kind: 'idleBlocks',
  label: 'Blockyard',
  componentName: 'IdleBlocksWindow',
  componentPath: 'src/components/windows/idleBlocks/index.jsx',
  defaultSize: { w: 960, h: 680 },
  moduleMenu: { show: true, status: 'ready', order: 66, icon: 'Cube', label: 'Blockyard', hint: 'Idle building game. Dig blocks, stack them up, watch the yard turn 3D' },
  lab: { title: 'Blockyard', props: {} },
};
