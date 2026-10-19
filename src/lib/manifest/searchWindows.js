// Search engines: one window kind, set to an engine per Add-menu row
// (src/lib/search/engines.js), and the Auction Watcher (saved searches on
// shopgoodwill.com and eBay checked on a timer). Pure data.

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
  {
    kind: 'auctionWatcher',
    canvasType: 'auctionWatcher',
    label: 'Auction Watcher',
    componentName: 'AuctionWatcherWindow',
    componentPath: 'src/components/AuctionWatcherWindow.jsx',
    defaultSize: { w: 960, h: 640 },
    moduleMenu: { show: true, order: 48, icon: 'Eye', label: 'Auction Watcher', hint: 'Watch Goodwill and eBay for listings under your price' },
    launcher: { show: true, order: 48, icon: 'Eye', label: 'Auction Watcher', hint: 'watch Goodwill and eBay listings' },
    lab: { title: 'Auction Watcher' },
  },
];
