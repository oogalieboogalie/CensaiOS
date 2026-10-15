// Benchmarks: recorded Model arena runs and a per-model table (fastest,
// most picked as best, most often right, cost). Lives on the board, so
// teammates see it live. Opened by "Record this run" in the Model arena.
export const windowMeta = {
  kind: 'arenaBenchmarks',
  label: 'Benchmarks',
  componentName: 'ArenaBenchmarksWindow',
  componentPath: 'src/components/windows/arenaBenchmarks/index.jsx',
  defaultSize: { w: 860, h: 560 },
  header: { title: 'Benchmarks', icon: 'History' },
  moduleMenu: { show: true, status: 'ready', order: 9, icon: 'History', label: 'Benchmarks', hint: 'A distributed benchmark from your own real tasks: which models were fastest, most accurate and cheapest' },
  lab: { title: 'Benchmarks', props: {} },
};
