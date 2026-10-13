// Search: one search engine in a window (Add > Search engines).
export const windowMeta = {
  kind: 'searchEngine',
  label: 'Search',
  componentName: 'SearchEngineWindow',
  componentPath: 'src/components/windows/searchEngine/index.jsx',
  defaultSize: { w: 820, h: 640 },
  header: { title: 'Search', icon: 'Search' },
  moduleMenu: { show: true, status: 'ready', order: 30, icon: 'Search', label: 'Search', hint: 'DuckDuckGo, Google, SearXNG, Brave and more' },
  lab: { title: 'DuckDuckGo', props: { engine: 'duckduckgo', title: 'DuckDuckGo' } },
};
