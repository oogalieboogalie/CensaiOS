// Co-located window metadata. `npm run window:sync` wires it into the manifest.
export const windowMeta = {
  kind: 'gitDiff',
  label: 'Git Diff Viewer',
  componentName: 'GitDiffWindow',
  componentPath: 'src/components/windows/gitDiff/index.jsx',
  defaultSize: { w: 1000, h: 640 },
  moduleMenu: { show: true, status: 'ready', order: 20, icon: 'Branch', label: 'Git Diff Viewer', hint: 'Before on the left, after on the right: green is added, red is removed' },
  lab: { title: 'Git Diff Viewer', props: {} },
};
