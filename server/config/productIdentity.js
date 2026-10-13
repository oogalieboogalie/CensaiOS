export const PRODUCT_IDENTITY = Object.freeze({
  product: 'Censai',
  repository: 'Homebase',
  legacyProduct: 'CensaiHub',
  packageName: 'censai-hub',
  storageNamespace: 'homebase',
  preferredModeVariable: 'CENSAI_MODE',
  legacyModeVariable: 'HOMEBASE_MODE',
});

export function getConfiguredRuntimeMode(env = process.env) {
  return env[PRODUCT_IDENTITY.preferredModeVariable]
    || env[PRODUCT_IDENTITY.legacyModeVariable]
    || null;
}
