// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Teach (spec 12).
export const windowMeta = {
  kind: 'classroom',
  label: 'Classroom',
  componentName: 'ClassroomWindow',
  componentPath: 'src/components/windows/classroom/index.jsx',
  defaultSize: { w: 860, h: 600 },
  moduleMenu: { show: true, status: 'ready', order: 61, icon: 'Classroom', label: 'Classroom', hint: 'Teach a live class. Every student gets their own copy of this board' },
  lab: { title: 'Classroom', props: {} },
};
