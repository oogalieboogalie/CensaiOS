import {
  AUTH_MODE_VALUES,
  AUTH_MODES,
  CONNECTION_STATE_VALUES,
  DANGER_LEVEL_RANK,
  DANGER_LEVELS,
  DANGER_LEVEL_VALUES,
  DEFAULT_INTEGRATION,
  DESTRUCTIVE_PERMISSIONS,
  ELEVATED_PERMISSIONS,
  EMBED_MODE_VALUES,
  KNOWN_CAPABILITIES,
  PERMISSION_SCOPE_VALUES,
  PROVIDER_CATEGORIES,
} from './constants.js';
import { isHttpUrl, isPlainObject, isSlug } from './helpers.js';

export function isIntegrationManifest(manifest) {
  return isPlainObject(manifest) && isPlainObject(manifest.integration);
}

export function validateIntegrationMetadata(integration, opts = {}) {
  const label = opts.label || 'integration';
  const errors = [];
  const warnings = [];

  if (!isPlainObject(integration)) {
    errors.push(`${label}: integration must be an object`);
    return { errors, warnings };
  }

  validateProvider(integration, label, errors, warnings);
  validateModes(integration, label, errors);
  validateCapabilities(integration, label, errors, warnings);
  validatePermissions(integration, label, errors);
  validateStatusLabels(integration, label, errors, warnings);
  validateSecurityShape(integration, label, warnings);

  return { errors, warnings };
}

function validateProvider(integration, label, errors, warnings) {
  const provider = integration.provider;
  if (!isPlainObject(provider)) {
    errors.push(`${label}: integration.provider must be an object with an id and name`);
    return;
  }
  if (!isSlug(provider.id)) {
    errors.push(`${label}: provider.id must be a lowercase slug (got ${JSON.stringify(provider.id)})`);
  }
  if (typeof provider.name !== 'string' || !provider.name.trim()) {
    errors.push(`${label}: provider.name is required`);
  }
  if (provider.docsUrl !== undefined && !isHttpUrl(provider.docsUrl)) {
    errors.push(`${label}: provider.docsUrl must be an http(s) URL`);
  }
  if (provider.category !== undefined && !PROVIDER_CATEGORIES.includes(provider.category)) {
    warnings.push(`${label}: provider.category "${provider.category}" is not a known category`);
  }
}

function validateModes(integration, label, errors) {
  if (!AUTH_MODE_VALUES.includes(integration.authMode)) {
    errors.push(`${label}: authMode must be one of [${AUTH_MODE_VALUES.join(', ')}] (got ${JSON.stringify(integration.authMode)})`);
  }
  if (integration.embedMode !== undefined && !EMBED_MODE_VALUES.includes(integration.embedMode)) {
    errors.push(`${label}: embedMode must be one of [${EMBED_MODE_VALUES.join(', ')}] (got ${JSON.stringify(integration.embedMode)})`);
  }
  if (integration.dangerLevel !== undefined && !DANGER_LEVEL_VALUES.includes(integration.dangerLevel)) {
    errors.push(`${label}: dangerLevel must be one of [${DANGER_LEVEL_VALUES.join(', ')}] (got ${JSON.stringify(integration.dangerLevel)})`);
  }
}

function validateCapabilities(integration, label, errors, warnings) {
  if (integration.capabilities === undefined) return;
  if (!Array.isArray(integration.capabilities)) {
    errors.push(`${label}: capabilities must be an array of strings`);
    return;
  }
  for (const cap of integration.capabilities) {
    if (typeof cap !== 'string' || !cap.trim()) {
      errors.push(`${label}: capabilities entries must be non-empty strings`);
    } else if (!KNOWN_CAPABILITIES.includes(cap)) {
      warnings.push(`${label}: capability "${cap}" is not in the known vocabulary`);
    }
  }
}

function validatePermissions(integration, label, errors) {
  if (integration.defaultPermissions === undefined) return;
  if (!Array.isArray(integration.defaultPermissions)) {
    errors.push(`${label}: defaultPermissions must be an array`);
    return;
  }
  for (const perm of integration.defaultPermissions) {
    if (!PERMISSION_SCOPE_VALUES.includes(perm)) {
      errors.push(`${label}: defaultPermissions "${perm}" is not a known permission scope [${PERMISSION_SCOPE_VALUES.join(', ')}]`);
    }
  }
}

function validateStatusLabels(integration, label, errors, warnings) {
  if (integration.statusLabels === undefined) return;
  if (!isPlainObject(integration.statusLabels)) {
    errors.push(`${label}: statusLabels must be an object keyed by connection state`);
    return;
  }
  for (const [state, text] of Object.entries(integration.statusLabels)) {
    if (!CONNECTION_STATE_VALUES.includes(state)) {
      warnings.push(`${label}: statusLabels key "${state}" is not a known connection state`);
    }
    if (typeof text !== 'string' || !text.trim()) {
      errors.push(`${label}: statusLabels.${state} must be a non-empty string`);
    }
  }
}

function validateSecurityShape(integration, label, warnings) {
  const permissions = Array.isArray(integration.defaultPermissions) ? integration.defaultPermissions : [];
  const elevatedWithoutAuth = integration.authMode === AUTH_MODES.NONE
    && permissions.filter((perm) => ELEVATED_PERMISSIONS.includes(perm));
  if (elevatedWithoutAuth && elevatedWithoutAuth.length) {
    warnings.push(`${label}: authMode "none" grants elevated permissions (${elevatedWithoutAuth.join(', ')}) without authentication`);
  }

  const dangerLevel = integration.dangerLevel || DEFAULT_INTEGRATION.dangerLevel;
  const destructive = permissions.filter((perm) => DESTRUCTIVE_PERMISSIONS.includes(perm));
  if (destructive.length && (DANGER_LEVEL_RANK[dangerLevel] ?? 0) < DANGER_LEVEL_RANK[DANGER_LEVELS.ELEVATED]) {
    warnings.push(`${label}: dangerLevel "${dangerLevel}" looks low for destructive permissions (${destructive.join(', ')})`);
  }
}
