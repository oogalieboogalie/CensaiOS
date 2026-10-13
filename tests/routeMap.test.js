/**
 * routeMap.test.js — shape + mount contract for the data-driven
 * ROUTE_MOUNTS table. Catches regressions where a maintainer adds a
 * mount with the wrong shape or where mountRoutes(app) stops walking
 * the table cleanly.
 */
import express from 'express';
import request from 'supertest';
import { ROUTE_MOUNTS, mountRoutes } from '../server/boot/routeMap.js';

describe('routeMap — shape contract', () => {
  test('ROUTE_MOUNTS is a non-empty array', () => {
    expect(Array.isArray(ROUTE_MOUNTS)).toBe(true);
    expect(ROUTE_MOUNTS.length).toBeGreaterThan(0);
  });

  test('every entry has a string path and a valid method', () => {
    const validMethods = ['use', 'get', 'post', 'put', 'delete', 'patch'];
    for (const entry of ROUTE_MOUNTS) {
      expect(typeof entry.path).toBe('string');
      expect(entry.path.length).toBeGreaterThan(0);
      expect(validMethods).toContain(entry.method || 'use');
    }
  });

  test('every router is a function and every middleware is an array of functions', () => {
    for (const entry of ROUTE_MOUNTS) {
      if (entry.router !== undefined) expect(typeof entry.router).toBe('function');
      if (entry.middleware !== undefined) {
        expect(Array.isArray(entry.middleware)).toBe(true);
        for (const fn of entry.middleware) expect(typeof fn).toBe('function');
      }
    }
  });
});

describe('routeMap — mount contract', () => {
  test('mountRoutes(app) walks every entry without throwing and returns app', () => {
    const app = express();
    expect(mountRoutes(app)).toBe(app);
  });

  test('mountRoutes registers every entry on the Express stack', () => {
    const app = express();
    mountRoutes(app);
    // Express 5 stores mounts under app.router.stack.
    const routerLayers = app.router.stack.filter((l) => l.name === 'router');
    expect(routerLayers.length).toBeGreaterThanOrEqual(20);
  });

  test('unknown sub-paths 404 cleanly (no throws, no 500s)', async () => {
    const app = express();
    mountRoutes(app);
    const res = await request(app).get('/api/__no_such_route__');
    expect(res.status).toBe(404);
  });
});