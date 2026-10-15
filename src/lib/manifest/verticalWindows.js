// Windows that belong to an industry board template (spec 7: Real Estate
// Team). They open from the template, so they stay out of the module menu.
// Pure data: no logic lives here.

export const VERTICAL_WINDOW_MANIFESTS = [
  {
    kind: 'listingWriter',
    canvasType: 'listingWriter',
    label: 'Listing Writer',
    componentName: 'ListingWriterWindow',
    componentPath: 'src/components/ListingWriterWindow.jsx',
    defaultSize: { w: 520, h: 640 },
    header: { title: 'Listing Writer', icon: 'Edit' },
    moduleMenu: { show: false },
    lab: { title: 'Listing Writer', props: { listing: { address: '14 Alder Way', beds: '3', baths: '2', sqft: '1850', price: '465000', features: 'Updated kitchen, south-facing deck, new roof.' } } },
  },
  {
    kind: 'outbox',
    canvasType: 'outbox',
    label: 'Outbox',
    componentName: 'OutboxWindow',
    componentPath: 'src/components/OutboxWindow.jsx',
    defaultSize: { w: 480, h: 600 },
    header: { title: 'Outbox', icon: 'Mail' },
    moduleMenu: { show: false },
    lab: { title: 'Outbox', props: { drafts: [] } },
  },
];
