import {
  AUTH_MODES,
  DANGER_LEVEL_RANK,
  DEFAULT_INTEGRATION,
  DEFAULT_STATUS_LABELS,
} from './constants.js';
import { isPlainObject } from './helpers.js';

export function normalizeIntegration(integration) {
  if (!isPlainObject(integration)) return null;
  return {
    ...DEFAULT_INTEGRATION,
    ...integration,
    provider: { ...(integration.provider || {}) },
    capabilities: [...(integration.capabilities || [])],
    defaultPermissions: [...(integration.defaultPermissions || [])],
    statusLabels: { ...DEFAULT_STATUS_LABELS, ...(integration.statusLabels || {}) },
  };
}

export function getStatusLabel(integration, state) {
  const labels = (isPlainObject(integration) && isPlainObject(integration.statusLabels))
    ? { ...DEFAULT_STATUS_LABELS, ...integration.statusLabels }
    : DEFAULT_STATUS_LABELS;
  return labels[state] || DEFAULT_STATUS_LABELS[state] || String(state);
}

export function requiresAuth(integration) {
  return Boolean(integration) && integration.authMode != null && integration.authMode !== AUTH_MODES.NONE;
}

export function compareDanger(a, b) {
  return (DANGER_LEVEL_RANK[a] ?? -1) - (DANGER_LEVEL_RANK[b] ?? -1);
}
