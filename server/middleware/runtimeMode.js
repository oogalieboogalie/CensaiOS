import { getConfiguredRuntimeMode } from '../config/productIdentity.js';

export const RUNTIME_MODES = Object.freeze({
  LOCAL_DESKTOP: 'local_desktop',
  PRIVATE_SERVER: 'private_server',
  CLOUD_SAAS: 'cloud_saas',
});

export function getRuntimeMode() {
  return getConfiguredRuntimeMode() || (
    process.env.NODE_ENV === 'production' ? RUNTIME_MODES.CLOUD_SAAS : RUNTIME_MODES.LOCAL_DESKTOP
  );
}

// Aggregates the full per-request context that handlers need. Pulls tenantId +
// workspaceId from req.workspaceContext (populated by resolveWorkspaceContext)
// and actor/principal from req.session (set by server/routes/auth.js). Returns
// a plain object so callers can destructure or pass to logging.
export function getRequestContext(req) {
  const session = req?.session || {};
  const workspaceContext = req?.workspaceContext || {};
  return {
    tenantId: workspaceContext.tenantId ?? null,
    workspaceId: workspaceContext.workspaceId ?? workspaceContext.id ?? null,
    actor: session.userId ?? null,
    principal: session.userRole ?? null,
    runtimeMode: getRuntimeMode(),
  };
}

export function isCloudRuntime(mode = getRuntimeMode()) {
  return mode === RUNTIME_MODES.CLOUD_SAAS;
}

export function isFeatureEnabled(featureName, {
  env = process.env,
  mode = getRuntimeMode(),
  defaultValue = false,
} = {}) {
  const feature = normalizeFeatureName(featureName);
  if (!feature) return Boolean(defaultValue);

  const direct = parseBoolean(env[`CENSAI_FEATURE_${envFeatureKey(feature)}`]);
  if (direct !== null) return direct;

  const globalFeatures = parseFeatureList(env.CENSAI_FEATURES);
  if (globalFeatures.has(feature) || globalFeatures.has('*')) return true;

  const modeFeatures = parseFeatureList(env[`CENSAI_FEATURES_${envFeatureKey(mode)}`]);
  if (modeFeatures.has(feature) || modeFeatures.has('*')) return true;

  return Boolean(defaultValue);
}

export function requireFeatureFlag(featureName, options = {}) {
  return (req, res, next) => {
    const mode = getRuntimeMode();
    if (isFeatureEnabled(featureName, { mode, defaultValue: options.defaultValue })) {
      return next();
    }

    return res.status(options.status || 404).json({
      error: options.message || `Feature "${featureName}" is not enabled`,
      feature: featureName,
      mode,
    });
  };
}

export function requireLocalFilesystem(req, res, next) {
  const mode = getRuntimeMode();

  if (mode === RUNTIME_MODES.CLOUD_SAAS) {
    return res.status(403).json({
      error: 'Local filesystem access is disabled in cloud_saas mode',
      mode,
    });
  }

  if (mode === RUNTIME_MODES.PRIVATE_SERVER && process.env.HOMEBASE_ALLOW_LOCAL_FILES !== 'true') {
    return res.status(403).json({
      error: 'Local filesystem access requires HOMEBASE_ALLOW_LOCAL_FILES=true',
      mode,
    });
  }

  next();
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return null;
}

function parseFeatureList(value) {
  return new Set(String(value || '')
    .split(',')
    .map(normalizeFeatureName)
    .filter(Boolean));
}

function normalizeFeatureName(value) {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-');
}

function envFeatureKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}
