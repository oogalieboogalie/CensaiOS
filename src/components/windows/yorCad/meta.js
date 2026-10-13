// YorWare CAD, the CAD app of the YorWare Suite (Add > YorWare Suite).
export const windowMeta = {
  kind: 'yorCad',
  label: 'CAD',
  componentName: 'YorCadWindow',
  componentPath: 'src/components/windows/yorCad/index.jsx',
  defaultSize: { w: 1120, h: 720 },
  header: { title: 'CAD', icon: 'Toolbox' },
  moduleMenu: { show: true, status: 'ready', order: 51, icon: 'Toolbox', label: 'CAD', hint: 'Parts with sizes you dial in; STL for 3D printers, STEP for machine shops' },
  lab: { title: 'Wall bracket', props: { title: 'Wall bracket' } },
};
