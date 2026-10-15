// YorWare Writer (grown from Censai Docs; Add > YorWare Suite). The kind
// stays officeDocs so documents on older boards keep opening.
export const windowMeta = {
  kind: 'officeDocs',
  label: 'Writer',
  componentName: 'OfficeDocsWindow',
  componentPath: 'src/components/windows/officeDocs/index.jsx',
  defaultSize: { w: 760, h: 640 },
  header: { title: 'Writer', icon: 'Files' },
  moduleMenu: { show: true, status: 'ready', order: 40, icon: 'Files', label: 'Writer', hint: 'Letters and long documents on real pages; open and save Word, save PDF' },
  lab: { title: 'Launch plan', props: { title: 'Launch plan' } },
};
