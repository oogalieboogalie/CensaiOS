// Co-located window metadata. `npm run window:sync` wires it into the
// manifest; the Add palette lists it under Games with its cover.
export const windowMeta = {
  kind: 'codeRobot',
  label: 'Code Robot',
  componentName: 'CodeRobotWindow',
  componentPath: 'src/components/windows/codeRobot/index.jsx',
  defaultSize: { w: 900, h: 580 },
  moduleMenu: { show: true, status: 'ready', order: 63, icon: 'Gamepad', label: 'Code Robot', hint: 'Learn to code: write JavaScript that steers a robot through ten levels' },
  lab: { title: 'Code Robot', props: {} },
};
