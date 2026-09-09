import {
  getConfiguredRuntimeMode,
  PRODUCT_IDENTITY,
} from '../server/config/productIdentity.js';

describe('product identity', () => {
  test('publishes the canonical and compatibility names', () => {
    expect(PRODUCT_IDENTITY).toEqual(expect.objectContaining({
      product: 'Censai',
      repository: 'Homebase',
      legacyProduct: 'CensaiHub',
      storageNamespace: 'homebase',
    }));
  });

  test('prefers CENSAI_MODE while preserving HOMEBASE_MODE', () => {
    expect(getConfiguredRuntimeMode({
      CENSAI_MODE: 'cloud_saas',
      HOMEBASE_MODE: 'local_desktop',
    })).toBe('cloud_saas');
    expect(getConfiguredRuntimeMode({
      HOMEBASE_MODE: 'private_server',
    })).toBe('private_server');
  });
});
