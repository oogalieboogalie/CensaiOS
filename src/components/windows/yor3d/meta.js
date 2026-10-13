// YorWare 3D Viewer: open and look around 3D models on the board
// (Add > YorWare Suite).
export const windowMeta = {
  kind: 'yor3d',
  label: '3D Viewer',
  componentName: 'Yor3dWindow',
  componentPath: 'src/components/windows/yor3d/index.jsx',
  defaultSize: { w: 1080, h: 720 },
  header: { title: '3D Viewer', icon: 'Cube' },
  moduleMenu: { show: true, status: 'ready', order: 50, icon: 'Cube', label: '3D Viewer', hint: 'Open GLB, glTF, STL, OBJ, FBX, 3MF and more; turn, measure, pin notes; save GLB or STL' },
  lab: { title: 'Rocket', props: { title: 'Rocket' } },
};
