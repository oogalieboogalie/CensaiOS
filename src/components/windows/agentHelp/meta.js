// A help request between two agents, as a card on the shared canvas.
export const windowMeta = {
  kind: 'agentHelp',
  label: 'Help request',
  componentName: 'AgentHelpWindow',
  componentPath: 'src/components/windows/agentHelp/index.jsx',
  defaultSize: { w: 340, h: 280 },
  lab: {
    title: 'Help request',
    props: {
      executor: 'network', fromLabel: 'Atlas', toLabel: 'Nexus', status: 'completed',
      task: 'Write the migration that adds a status column to orders.',
      result: 'ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT \'open\';',
    },
  },
};
