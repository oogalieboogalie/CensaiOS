// Local Sites: one-page websites for a small shop (thrift store, tattoo
// shop, bakery), filled in and downloaded as a folder that runs anywhere.
export const windowMeta = {
  kind: 'localSites',
  label: 'Local Sites',
  componentName: 'LocalSitesWindow',
  componentPath: 'src/components/windows/localSites/index.jsx',
  defaultSize: { w: 1080, h: 700 },
  header: { title: 'Local Sites', icon: 'ShoppingBag' },
  moduleMenu: { show: true, status: 'ready', order: 43, icon: 'ShoppingBag', label: 'Local Sites', hint: 'A ready website for a thrift store, tattoo shop or bakery; download the folder and put it online free' },
  lab: { title: 'Local Sites', props: { site: { preset: 'bakery' } } },
};
