// Censai Office windows: Writer (shown under YorWare Suite), Sheets, Slides and
// Local Sites (websites for a small shop). Graduated out of
// factoryWindows.js to keep that file under its size budget. Pure data.

export const OFFICE_WINDOW_MANIFESTS = [
  {
    kind: 'officeDocs',
    canvasType: 'officeDocs',
    label: 'Writer',
    componentName: 'OfficeDocsWindow',
    componentPath: 'src/components/windows/officeDocs/index.jsx',
    defaultSize: { w: 760, h: 640 },
    header: { title: 'Writer', icon: 'Files' },
    lab: {"title":"Launch plan","props":{"title":"Launch plan"}},
    moduleMenu: {"show":true,"status":"ready","order":40,"icon":"Files","label":"Writer","hint":"Letters and long documents on real pages; open and save Word, save PDF"},
  },
  {
    kind: 'officeSheets',
    canvasType: 'officeSheets',
    label: 'Sheets',
    componentName: 'OfficeSheetsWindow',
    componentPath: 'src/components/windows/officeSheets/index.jsx',
    defaultSize: { w: 900, h: 560 },
    header: { title: 'Sheets', icon: 'List' },
    lab: {"title":"Budget","props":{"title":"Budget"}},
    moduleMenu: {"show":true,"status":"ready","order":41,"icon":"List","label":"Sheets","hint":"Formulas and charts, Excel and CSV"},
  },
  {
    kind: 'officeSlides',
    canvasType: 'officeSlides',
    label: 'Slides',
    componentName: 'OfficeSlidesWindow',
    componentPath: 'src/components/windows/officeSlides/index.jsx',
    defaultSize: { w: 960, h: 600 },
    header: { title: 'Slides', icon: 'Monitor' },
    lab: {"title":"Pitch","props":{"title":"Pitch"}},
    moduleMenu: {"show":true,"status":"ready","order":42,"icon":"Monitor","label":"Slides","hint":"Present, export PowerPoint and PDF"},
  },
  {
    kind: 'localSites',
    canvasType: 'localSites',
    label: 'Local Sites',
    componentName: 'LocalSitesWindow',
    componentPath: 'src/components/windows/localSites/index.jsx',
    defaultSize: { w: 1080, h: 700 },
    header: { title: 'Local Sites', icon: 'ShoppingBag' },
    lab: {"title":"Local Sites","props":{"site":{"preset":"bakery"}}},
    moduleMenu: {"show":true,"status":"ready","order":43,"icon":"ShoppingBag","label":"Local Sites","hint":"A ready website for a thrift store, tattoo shop or bakery; download the folder and put it online free"},
  },
];
