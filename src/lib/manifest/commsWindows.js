// The Comms window: push to talk with an agent and hear the reply.
// Pure data: no logic lives here.
export const COMMS_WINDOW_MANIFESTS = [
  {
    kind: 'voiceComms',
    canvasType: 'voiceComms',
    label: 'Comms',
    componentName: 'VoiceCommsWindow',
    componentPath: 'src/components/windows/voiceComms/index.jsx',
    defaultSize: { w: 580, h: 480 },
    lab: { title: 'Comms', props: {} },
    moduleMenu: { show: true, status: 'ready', order: 20, icon: 'Mic', label: 'Comms', hint: 'Hold to talk to an agent and hear the reply' },
    launcher: { show: true, order: 20, icon: 'Mic', hint: 'push to talk with your agents' },
  },
];
