// The public "try it" board (censai.app/try): the real app, built with
// VITE_CENSAI_DEMO=1, running entirely in the visitor's browser. There is no
// server behind it: every /api call is answered in the page (demoApi.js),
// nothing is saved, and a reload starts the sample board over.
export const DEMO = import.meta.env?.VITE_CENSAI_DEMO === '1';

// Where the demo's "Get censaiOS" button and any outside links point.
export const DEMO_HOME = 'https://censai.app/';
