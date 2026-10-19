import { describe, expect, test } from '@jest/globals';
import { HOST_TARGETS, KIND_WORDS, hostTarget } from '../src/lib/hosting/hostTargets.js';
import { SECRET_NAMES, hostRecipe, makeSecret, serviceName } from '../src/lib/hosting/hostRecipes.js';
import { brandFor } from '../src/lib/brands/index.js';
import { WINDOW_MANIFEST_BY_KIND } from '../src/lib/windowManifest.js';

const secrets = { SESSION_SECRET: 'a'.repeat(64), JOURNAL_SECRET: 'b'.repeat(64), CENSAI_VAULT_SECRET: 'c'.repeat(64) };
const fileText = (recipe, name) => recipe.files.find((f) => f.name === name)?.text || '';

describe('places to host (diagram 18)', () => {
  test('all seven places from the drawing, each with a mark and a kind', () => {
    expect(HOST_TARGETS.map((t) => t.id)).toEqual(['docker', 'kubernetes', 'railway', 'render', 'cloudrun', 'supabase', 'jupyter']);
    for (const t of HOST_TARGETS) {
      expect(brandFor(t.brand)).not.toBeNull();
      expect(KIND_WORDS[t.kind]).toBeTruthy();
      if (t.opens) expect(WINDOW_MANIFEST_BY_KIND[t.opens]).toBeTruthy();
    }
    expect(hostTarget('nope').id).toBe('docker');
  });

  test('Docker and Kubernetes open their windows; the rest get files and steps', () => {
    expect(hostRecipe('docker')).toBeNull();
    expect(hostRecipe('kubernetes')).toBeNull();
    for (const id of ['railway', 'render', 'cloudrun', 'supabase', 'jupyter']) {
      const recipe = hostRecipe(id, { secrets });
      expect(recipe.files.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(2);
    }
  });

  test('Railway: builds the Dockerfile, checks health, gets the database and secrets', () => {
    const recipe = hostRecipe('railway', { secrets });
    const config = JSON.parse(fileText(recipe, 'railway.json'));
    expect(config.build.builder).toBe('DOCKERFILE');
    expect(config.deploy.healthcheckPath).toBe('/api/health');
    const vars = fileText(recipe, 'railway-variables.txt');
    expect(vars).toContain('DATABASE_URL=${{Postgres.DATABASE_URL}}');
    expect(vars).toContain(`SESSION_SECRET=${'a'.repeat(64)}`);
    expect(vars).toContain('CENSAI_SELF_SETUP=1');
  });

  test('Render: one blueprint with the app, its database and generated secrets', () => {
    const yaml = fileText(hostRecipe('render', { app: 'My Board!' }), 'render.yaml');
    expect(yaml).toContain('name: my-board');
    expect(yaml).toContain('runtime: docker');
    expect(yaml).toContain('name: my-board-db');
    for (const name of SECRET_NAMES) expect(yaml).toContain(`- key: ${name}\n        generateValue: true`);
  });

  test('Cloud Run: an env file with the secrets and one deploy command', () => {
    const recipe = hostRecipe('cloudrun', { secrets });
    expect(fileText(recipe, 'cloudrun.env.yaml')).toContain(`JOURNAL_SECRET: "${'b'.repeat(64)}"`);
    expect(fileText(recipe, 'deploy-command.txt')).toMatch(/^gcloud run deploy censaios --source \. .*--port 3001 .*--env-vars-file cloudrun\.env\.yaml\n$/);
    // No secret given: a placeholder, never an empty value.
    expect(fileText(hostRecipe('cloudrun'), 'cloudrun.env.yaml')).toContain('SESSION_SECRET: "make-a-long-random-value"');
  });

  test('Supabase gives the connection string shape; Jupyter runs beside the board', () => {
    expect(fileText(hostRecipe('supabase'), 'supabase-database.txt')).toMatch(/DATABASE_URL=postgresql:\/\/.*pooler\.supabase\.com:5432\/postgres/);
    const jupyter = hostRecipe('jupyter');
    expect(fileText(jupyter, 'notebook-command.txt')).toContain('-p 8888:8888');
    expect(fileText(jupyter, 'first-cell.py')).toContain('/api/health');
  });

  test('secrets are 64 hex characters; names are safe', () => {
    expect(makeSecret((n) => new Uint8Array(n).fill(171))).toBe('ab'.repeat(32));
    expect(serviceName('  ')).toBe('censaios');
    expect(serviceName('Alex & Co')).toBe('alex-co');
  });
});
