// Co-located window metadata. Wired into the manifest; Add palette lists it under Media.
export const windowMeta = {
  kind: 'reddit',
  label: 'Reddit',
  componentName: 'RedditWindow',
  componentPath: 'src/components/windows/reddit/index.jsx',
  defaultSize: { w: 420, h: 720 },
  sizeClass: 'fixed',
  embedMode: 'webview',
  moduleMenu: {
    show: true,
    status: 'ready',
    order: 64,
    icon: 'Reddit',
    label: 'Reddit',
    hint: 'Scroll Reddit on the board — pick a subreddit or your home feed',
  },
  lab: { title: 'Reddit', props: {} },
};
