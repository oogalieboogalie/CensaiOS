// Censai Creative windows: Photo, Vector and Video, the Adobe-style set.
// Kept in their own file like Censai Office. Pure data.

export const CREATIVE_WINDOW_MANIFESTS = [
  {
    kind: 'creativePhoto',
    canvasType: 'creativePhoto',
    label: 'Photo',
    componentName: 'CreativePhotoWindow',
    componentPath: 'src/components/windows/creativePhoto/index.jsx',
    defaultSize: { w: 1080, h: 680 },
    header: { title: 'Photo', icon: 'Picture' },
    lab: {"title":"Poster","props":{"title":"Poster"}},
    moduleMenu: {"show":true,"status":"ready","order":43,"icon":"Picture","label":"Photo","hint":"Layers, brush, crop, filters; PNG, JPEG, WebP"},
  },
  {
    kind: 'creativeVector',
    canvasType: 'creativeVector',
    label: 'Vector',
    componentName: 'CreativeVectorWindow',
    componentPath: 'src/components/windows/creativeVector/index.jsx',
    defaultSize: { w: 1080, h: 680 },
    header: { title: 'Vector', icon: 'Edit' },
    lab: {"title":"Logo","props":{"title":"Logo"}},
    moduleMenu: {"show":true,"status":"ready","order":44,"icon":"Edit","label":"Vector","hint":"Pen, shapes, align, groups; SVG in and out"},
  },
  {
    kind: 'creativeVideo',
    canvasType: 'creativeVideo',
    label: 'Video',
    componentName: 'CreativeVideoWindow',
    componentPath: 'src/components/windows/creativeVideo/index.jsx',
    defaultSize: { w: 1120, h: 720 },
    header: { title: 'Video', icon: 'Video' },
    lab: {"title":"Reel","props":{"title":"Reel"}},
    moduleMenu: {"show":true,"status":"ready","order":45,"icon":"Video","label":"Video","hint":"Timeline, trim, split, titles, audio; MP4 or WebM"},
  },
];
