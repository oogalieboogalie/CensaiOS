// The confirmations window: the short list of things only the owner can decide.
export const CONFIRMATIONS_WINDOW_MANIFESTS = [
  {
    kind: 'confirmations',
    canvasType: 'confirmations',
    label: 'Needs you',
    componentName: 'ConfirmationsWindow',
    componentPath: 'src/components/windows/confirmations/index.jsx',
    defaultSize: { w: 560, h: 480 },
    header: { title: 'Needs you', icon: 'List' },
    moduleMenu: {
      show: true,
      status: 'ready',
      order: 12,
      icon: 'List',
      label: 'Needs you',
      hint: 'The short list of things only you can decide',
    },
    launcher: {
      show: true,
      order: 12,
      icon: 'List',
      hint: 'The short list of things only you can decide',
    },
  },
];
