// Comms: a push-to-talk channel with the agent family. Hold to talk to one
// agent, release, and hear the reply.
export const windowMeta = {
  kind: 'voiceComms',
  label: 'Comms',
  componentName: 'VoiceCommsWindow',
  componentPath: 'src/components/windows/voiceComms/index.jsx',
  defaultSize: { w: 580, h: 480 },
  lab: { title: 'Comms', props: {} },
  moduleMenu: { show: true, status: 'ready', order: 20, icon: 'Mic', label: 'Comms', hint: 'Hold to talk to an agent and hear the reply' },
  launcher: { show: true, order: 20, icon: 'Mic', hint: 'push to talk with your agents' },
};
