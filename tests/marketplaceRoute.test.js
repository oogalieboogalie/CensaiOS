import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const publishModuleListing = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/marketplace/moduleListings.js', () => ({
  getModuleListing: jest.fn(),
  installModuleListing: jest.fn(),
  listModuleListings: jest.fn(async () => []),
  marketplacePublicKey: jest.fn(),
  previewModuleListing: jest.fn(() => ({ checks: { score: 9, total: 9, passed: true }, refused: null })),
  publishModuleListing,
  sellerStatus: jest.fn(),
  unlistModuleListing: jest.fn(),
}));

const { marketplaceRouter } = await import('../server/routes/marketplace.js');

function app(userId = 7) {
  const a = express();
  a.use(express.json({ limit: '2mb' }));
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.use('/api/marketplace', marketplaceRouter);
  return a;
}

test('the marketplace needs a signed-in person', async () => {
  expect((await request(app(null)).get('/api/marketplace/modules')).status).toBe(401);
  expect((await request(app(null)).post('/api/marketplace/modules').send({})).status).toBe(401);
});

test('publishing passes the module through and returns failed checks with the error', async () => {
  const checks = { score: 6, total: 9, passed: false, results: [] };
  publishModuleListing.mockRejectedValueOnce(Object.assign(new Error('It passed 6 of 9 checks.'), { statusCode: 422, code: 'MARKETPLACE_CHECKS_FAILED', checks }));
  const res = await request(app()).post('/api/marketplace/modules').send({ source: '<p>x</p>', manifest: { name: 'X' }, summary: 'One line', request: 'x' });
  expect(publishModuleListing).toHaveBeenCalledWith({}, 7, { listingId: null, request: 'x', manifest: { name: 'X' }, source: '<p>x</p>', summary: 'One line' });
  expect(res.status).toBe(422);
  expect(res.body).toEqual({ error: 'It passed 6 of 9 checks.', code: 'MARKETPLACE_CHECKS_FAILED', checks });
});

test('a module too large for the checks is refused up front', async () => {
  const res = await request(app()).post('/api/marketplace/modules/check').send({ source: 'x'.repeat(210 * 1024) });
  expect(res.status).toBe(413);
});
