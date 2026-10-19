// Places to host censaiOS (Alex's diagram 18, the "Deployment Integrations"
// row): Docker, Kubernetes, Railway, Render, Jupyter, Supabase, Google Cloud.
// Pure: the Places to Host window and tests read it; recipes live in
// hostRecipes.js.

// kind: what the board can do with it today.
//   'runs-here'  the board already runs it from a window (opens that window)
//   'look-only'  a window can look but not change anything
//   'get-file'   the board writes the file that service reads; you upload it
//   'database'   it hosts the database part, not the app
//   'notebook'   it runs next to the app, not instead of it
export const HOST_TARGETS = Object.freeze([
  {
    id: 'docker', brand: 'docker', name: 'Docker', kind: 'runs-here', opens: 'containers',
    where: 'Your own computer',
    blurb: 'censaiOS already runs in Docker on your computer. The Docker window starts, stops and rebuilds it.',
  },
  {
    id: 'kubernetes', brand: 'kubernetes', name: 'Kubernetes', kind: 'look-only', opens: 'kubernetes',
    where: 'A cluster you already have',
    blurb: 'The Kubernetes window shows what is running on a cluster you connect. It looks only; it never changes the cluster.',
  },
  {
    id: 'railway', brand: 'railway', name: 'Railway', kind: 'get-file',
    where: 'railway.com, pay as you go',
    blurb: 'Railway builds censaiOS from its Dockerfile and gives it a web address. Add their Postgres and it is online.',
  },
  {
    id: 'render', brand: 'render', name: 'Render', kind: 'get-file',
    where: 'render.com, free tier to start',
    blurb: 'One render.yaml file sets up the app, its database and its secrets in a single step on Render.',
  },
  {
    id: 'cloudrun', brand: 'googlecloud', name: 'Google Cloud Run', kind: 'get-file',
    where: 'Google Cloud, pay per use',
    blurb: 'Cloud Run builds the Dockerfile and runs it only while people use it. Pair it with a database such as Supabase.',
  },
  {
    id: 'supabase', brand: 'supabase', name: 'Supabase', kind: 'database',
    where: 'supabase.com, free tier to start',
    blurb: 'Supabase hosts the Postgres database. Point any of the places above at it and your boards live there.',
  },
  {
    id: 'jupyter', brand: 'jupyter', name: 'Jupyter', kind: 'notebook',
    where: 'Next to censaiOS, in Docker',
    blurb: 'A Jupyter notebook runs beside censaiOS for data work. It reaches the board through the same web address.',
  },
]);

export const KIND_WORDS = Object.freeze({
  'runs-here': 'Runs here today',
  'look-only': 'Look only',
  'get-file': 'Get the file',
  database: 'Database',
  notebook: 'Runs beside it',
});

const BY_ID = new Map(HOST_TARGETS.map((target) => [target.id, target]));

/** One place to host by id, or the first one. */
export function hostTarget(id) {
  return BY_ID.get(id) || HOST_TARGETS[0];
}
