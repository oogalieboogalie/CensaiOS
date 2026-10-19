// Places to Host (Alex's diagram 18, "Deployment Integrations"): every place
// censaiOS can live, with the file and the steps each one needs. Listed
// under Add > Build.
export const windowMeta = {
  kind: 'hosting',
  label: 'Places to Host',
  componentName: 'HostingWindow',
  componentPath: 'src/components/windows/hosting/index.jsx',
  defaultSize: { w: 920, h: 620 },
  header: { title: 'Places to Host', icon: 'Server' },
  moduleMenu: { show: true, status: 'ready', order: 155, icon: 'Server', label: 'Places to Host', hint: 'Put censaiOS online: Docker, Kubernetes, Railway, Render, Google Cloud, Supabase and Jupyter, each with its file and steps' },
  lab: { title: 'Places to Host', props: {} },
};
