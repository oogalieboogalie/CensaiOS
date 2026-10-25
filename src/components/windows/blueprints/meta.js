// Blueprints (diagram 08): a board's shelf of recipes that worked,
// each with an ID, found by asking "Do we have ...". Listed under Add > Work.
export const windowMeta = {
  kind: 'blueprints',
  label: 'Blueprints',
  componentName: 'BlueprintsWindow',
  componentPath: 'src/components/windows/blueprints/index.jsx',
  defaultSize: { w: 940, h: 620 },
  header: { title: 'Blueprints', icon: 'Files' },
  moduleMenu: { show: true, status: 'ready', order: 67, icon: 'Files', label: 'Blueprints', hint: 'A shelf of recipes that worked, each with its own ID. Ask "Do we have any budget blueprints?" and agents look here first' },
  lab: { title: 'Blueprints', props: {} },
};
