// Search engines: one window kind, set to an engine per Add-menu row
// (src/lib/search/engines.js). Pure data.

export const SEARCH_WINDOW_MANIFESTS = [
  {
    kind: 'searchEngine',
    canvasType: 'searchEngine',
    label: 'Search',
    componentName: 'SearchEngineWindow',
    componentPath: 'src/components/windows/searchEngine/index.jsx',
    defaultSize: { w: 820, h: 640 },
    header: { title: 'Search', icon: 'Search' },
    lab: {"title":"DuckDuckGo","props":{"engine":"duckduckgo","title":"DuckDuckGo"}},
    moduleMenu: {"show":true,"status":"ready","order":30,"icon":"Search","label":"Search","hint":"DuckDuckGo, Google, SearXNG, Brave and more"},
  },
];
