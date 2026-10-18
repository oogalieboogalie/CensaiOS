// What each place to host needs (diagram 18): the file it reads and the
// steps, in plain words. Pure: the Places to Host window and tests use it.
// Secrets are passed in (the window makes them with the browser's random
// numbers) so nothing here guesses or stores one.

export const SECRET_NAMES = Object.freeze(['SESSION_SECRET', 'JOURNAL_SECRET', 'CENSAI_VAULT_SECRET']);
export const APP_PORT = 3001;
// The board's Docker app on this computer (docker-compose.yml publishes it here).
export const LOCAL_APP_URL = 'http://host.docker.internal:3002';

/** A safe service name: lowercase letters, digits and dashes. */
export function serviceName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'censaios';
}

/** 64 hex characters from any random-bytes source (the browser's crypto in the window). */
export function makeSecret(randomBytes) {
  const bytes = randomBytes(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function secretsFor(secrets = {}) {
  return SECRET_NAMES.map((name) => [name, secrets[name] || 'make-a-long-random-value']);
}

function railway({ app, secrets }) {
  const file = JSON.stringify({
    $schema: 'https://railway.com/railway.schema.json',
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: { healthcheckPath: '/api/health', restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
  }, null, 2);
  const vars = [
    'DATABASE_URL=${{Postgres.DATABASE_URL}}',
    'CENSAI_SELF_SETUP=1',
    `PORT=${APP_PORT}`,
    ...secretsFor(secrets).map(([name, value]) => `${name}=${value}`),
  ].join('\n');
  return {
    files: [{ name: 'railway.json', text: `${file}\n` }, { name: 'railway-variables.txt', text: `${vars}\n` }],
    steps: [
      'Put railway.json in the top folder of your censaiOS copy on GitHub.',
      `On railway.com: New Project, then Deploy from GitHub repo, and pick it. Name the service ${app}.`,
      'Click Create, then Database, then Add PostgreSQL.',
      'Open the app service, then Variables, then Raw Editor, and paste railway-variables.txt.',
      'Under Settings, Networking, click Generate Domain. Add APP_ORIGIN set to that address, then redeploy.',
    ],
  };
}

function render({ app, secrets }) {
  void secrets; // Render makes its own secrets (generateValue).
  const lines = [
    'services:',
    '  - type: web',
    `    name: ${app}`,
    '    runtime: docker',
    '    dockerfilePath: ./Dockerfile',
    '    healthCheckPath: /api/health',
    '    envVars:',
    '      - key: DATABASE_URL',
    '        fromDatabase:',
    `          name: ${app}-db`,
    '          property: connectionString',
    '      - key: CENSAI_SELF_SETUP',
    '        value: "1"',
    '      - key: PORT',
    `        value: "${APP_PORT}"`,
    ...SECRET_NAMES.flatMap((name) => [`      - key: ${name}`, '        generateValue: true']),
    'databases:',
    `  - name: ${app}-db`,
    '    plan: free',
  ];
  return {
    files: [{ name: 'render.yaml', text: `${lines.join('\n')}\n` }],
    steps: [
      'Put render.yaml in the top folder of your censaiOS copy on GitHub.',
      'On render.com: New, then Blueprint, and pick that repository.',
      'Render reads the file and makes the app, its database and three secrets. Click Apply.',
      'When it is live, add APP_ORIGIN under Environment, set to the address Render shows.',
    ],
  };
}

function cloudRun({ app, secrets }) {
  const env = [
    'DATABASE_URL: "paste your database connection string here"',
    'CENSAI_SELF_SETUP: "1"',
    ...secretsFor(secrets).map(([name, value]) => `${name}: "${value}"`),
  ].join('\n');
  const command = `gcloud run deploy ${app} --source . --region us-central1 --port ${APP_PORT} --allow-unauthenticated --env-vars-file cloudrun.env.yaml`;
  return {
    files: [{ name: 'cloudrun.env.yaml', text: `${env}\n` }, { name: 'deploy-command.txt', text: `${command}\n` }],
    steps: [
      'Cloud Run needs a database somewhere else. Supabase works: open its card for the connection string.',
      'Save cloudrun.env.yaml in the top folder of your censaiOS copy and paste the connection string into it.',
      'Keep that file out of GitHub; it holds your secrets.',
      'In the Google Cloud console, open Cloud Shell, go to that folder and run the deploy command.',
      'It prints a web address when done. Run it again with APP_ORIGIN added to the file, set to that address.',
    ],
  };
}

function supabase() {
  const text = [
    '# Paste as DATABASE_URL on Railway, Render or Cloud Run.',
    '# Supabase: your project, Connect, Session pooler, copy the URI, put your database password in it.',
    'DATABASE_URL=postgresql://postgres.YOUR-PROJECT:YOUR-PASSWORD@aws-0-YOUR-REGION.pooler.supabase.com:5432/postgres',
  ].join('\n');
  return {
    files: [{ name: 'supabase-database.txt', text: `${text}\n` }],
    steps: [
      'On supabase.com: New project. Write down the database password you choose.',
      'Click Connect, pick Session pooler, and copy the URI.',
      'Put your password where it says [YOUR-PASSWORD].',
      'Paste it as DATABASE_URL wherever the app runs. On first start censaiOS makes every table it needs.',
    ],
  };
}

function jupyter({ app }) {
  const command = `docker run -d --name ${app}-notebook -p 8888:8888 --add-host=host.docker.internal:host-gateway -v ${app}-notebooks:/home/jovyan/work quay.io/jupyter/base-notebook`;
  const cell = [
    '# First cell: check the notebook can reach your board.',
    'import json, urllib.request',
    `json.load(urllib.request.urlopen("${LOCAL_APP_URL}/api/health"))["database"]`,
  ].join('\n');
  return {
    files: [{ name: 'notebook-command.txt', text: `${command}\n` }, { name: 'first-cell.py', text: `${cell}\n` }],
    steps: [
      'Paste the command into a terminal (the Terminal window works). It starts a notebook beside censaiOS.',
      `Run: docker logs ${app}-notebook and open the link that starts with http://127.0.0.1:8888.`,
      'Make a new Python notebook and paste first-cell.py. True means it can see your board.',
      'Your notebooks are kept in a Docker volume, so they survive restarts.',
    ],
  };
}

const RECIPES = { railway, render, cloudrun: cloudRun, supabase, jupyter };

/**
 * The files and steps for one place to host. Docker and Kubernetes have no
 * recipe: their windows already do the work, so this returns null.
 */
export function hostRecipe(id, { app = 'censaios', secrets = {} } = {}) {
  const build = RECIPES[id];
  return build ? build({ app: serviceName(app), secrets }) : null;
}
