// Teleprompter: a script that scrolls by itself, with a pop-out that sits on
// top of everything right under the camera. Listed under Add > Media.
export const windowMeta = {
  kind: 'teleprompter',
  label: 'Teleprompter',
  componentName: 'TeleprompterWindow',
  componentPath: 'src/components/windows/teleprompter/index.jsx',
  defaultSize: { w: 720, h: 460 },
  header: { title: 'Teleprompter', icon: 'Video' },
  moduleMenu: { show: true, status: 'ready', order: 62, icon: 'Video', label: 'Teleprompter', hint: 'Read your script while looking at the camera: it scrolls by itself and pops out on top, right under the webcam' },
  lab: { title: 'Teleprompter', props: {} },
};
