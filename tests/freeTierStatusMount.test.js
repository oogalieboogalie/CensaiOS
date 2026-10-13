import { ROUTE_MOUNTS } from '../server/boot/routeMap.js';
import { freeTierStatusRouter } from '../server/routes/freeTierStatus.js';

test('mounts free-tier status once at its narrow authenticated API prefix', () => {
  const mounts = ROUTE_MOUNTS.filter(entry => entry.path === '/api/ai/free-tier');
  expect(mounts).toEqual([{
    method: 'use',
    path: '/api/ai/free-tier',
    router: freeTierStatusRouter,
  }]);
  expect(freeTierStatusRouter.stack.map(layer => layer.route?.path).filter(Boolean)).toEqual([
    '/status',
  ]);
});
