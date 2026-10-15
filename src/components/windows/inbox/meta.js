// Co-located window metadata. `npm run window:sync` wires it into the manifest.
export const windowMeta = {
  kind: 'inbox',
  label: 'Inbox',
  componentName: 'InboxWindow',
  componentPath: 'src/components/windows/inbox/index.jsx',
  defaultSize: { w: 900, h: 560 },
  moduleMenu: { show: true, status: 'ready', order: 18, icon: 'Inbox', label: 'Inbox', hint: 'Only what needs you: red checks, conflicts, agents waiting for an OK, errors' },
  lab: { title: 'Inbox', props: {} },
};
