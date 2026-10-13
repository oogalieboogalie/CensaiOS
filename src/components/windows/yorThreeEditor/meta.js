// YorWare 3D Editor, app eight of the YorWare Suite (Add > YorWare Suite):
// the three.js editor (MIT) running sealed, from module.js.
export const windowMeta = {
  kind: 'yorThreeEditor',
  label: '3D Editor',
  componentName: 'YorThreeEditorWindow',
  componentPath: 'src/components/windows/yorThreeEditor/index.jsx',
  defaultSize: { w: 1180, h: 760 },
  header: { title: '3D Editor', icon: 'CubeEdit' },
  // Runs in the module sandbox from module.js (manifest v3).
  sealedModule: true,
  moduleMenu: { show: true, status: 'ready', order: 52, icon: 'CubeEdit', label: '3D Editor', hint: 'Build 3D scenes: shapes, lights, materials; open and export GLB, OBJ, STL' },
  lab: { title: 'Desk scene', props: { title: 'Desk scene' } },
};
