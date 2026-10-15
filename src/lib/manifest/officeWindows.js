// Censai Office windows: Writer (shown under YorWare Suite), Sheets and Slides. Graduated out of
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
];
