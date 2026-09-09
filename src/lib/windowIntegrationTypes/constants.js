export const WINDOW_INTEGRATION_VERSION = 1;

export const AUTH_MODES = Object.freeze({
  NONE: 'none',
  API_KEY: 'apiKey',
  OAUTH2: 'oauth2',
  OAUTH_DEVICE: 'oauthDevice',
  BASIC: 'basic',
  SESSION: 'session',
  CUSTOM: 'custom',
});
export const AUTH_MODE_VALUES = Object.freeze(Object.values(AUTH_MODES));

export const EMBED_MODES = Object.freeze({
  NATIVE: 'native',
  IFRAME: 'iframe',
  PROXY: 'proxy',
  API_ONLY: 'apiOnly',
  HYBRID: 'hybrid',
});
export const EMBED_MODE_VALUES = Object.freeze(Object.values(EMBED_MODES));

export const DANGER_LEVELS = Object.freeze({
  SAFE: 'safe',
  LOW: 'low',
  ELEVATED: 'elevated',
  HIGH: 'high',
  CRITICAL: 'critical',
});
export const DANGER_LEVEL_VALUES = Object.freeze([
  DANGER_LEVELS.SAFE,
  DANGER_LEVELS.LOW,
  DANGER_LEVELS.ELEVATED,
  DANGER_LEVELS.HIGH,
  DANGER_LEVELS.CRITICAL,
]);
export const DANGER_LEVEL_RANK = Object.freeze(
  DANGER_LEVEL_VALUES.reduce((acc, level, index) => {
    acc[level] = index;
    return acc;
  }, {})
);

export const PERMISSION_SCOPES = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  EXECUTE: 'execute',
  ADMIN: 'admin',
  BILLING: 'billing',
  NOTIFY: 'notify',
});
export const PERMISSION_SCOPE_VALUES = Object.freeze(Object.values(PERMISSION_SCOPES));

export const ELEVATED_PERMISSIONS = Object.freeze([
  PERMISSION_SCOPES.WRITE,
  PERMISSION_SCOPES.DELETE,
  PERMISSION_SCOPES.EXECUTE,
  PERMISSION_SCOPES.ADMIN,
  PERMISSION_SCOPES.BILLING,
]);
export const DESTRUCTIVE_PERMISSIONS = Object.freeze([
  PERMISSION_SCOPES.DELETE,
  PERMISSION_SCOPES.ADMIN,
  PERMISSION_SCOPES.BILLING,
]);

export const CONNECTION_STATES = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  NEEDS_REAUTH: 'needsReauth',
  ERROR: 'error',
});
export const CONNECTION_STATE_VALUES = Object.freeze(Object.values(CONNECTION_STATES));

export const DEFAULT_STATUS_LABELS = Object.freeze({
  [CONNECTION_STATES.DISCONNECTED]: 'Not connected',
  [CONNECTION_STATES.CONNECTING]: 'Connecting...',
  [CONNECTION_STATES.CONNECTED]: 'Connected',
  [CONNECTION_STATES.NEEDS_REAUTH]: 'Re-authentication required',
  [CONNECTION_STATES.ERROR]: 'Connection error',
});

export const PROVIDER_CATEGORIES = Object.freeze([
  'developer-tools',
  'communication',
  'productivity',
  'storage',
  'ai-model',
  'analytics',
  'commerce',
  'infrastructure',
  'social',
  'other',
]);

export const KNOWN_CAPABILITIES = Object.freeze([
  'read',
  'write',
  'search',
  'sync',
  'webhook',
  'realtime',
  'fileUpload',
  'fileDownload',
  'notify',
  'agentTools',
  'embedView',
  'billing',
]);

export const DEFAULT_INTEGRATION = Object.freeze({
  authMode: AUTH_MODES.NONE,
  embedMode: EMBED_MODES.NATIVE,
  dangerLevel: DANGER_LEVELS.LOW,
  capabilities: Object.freeze([]),
  defaultPermissions: Object.freeze([]),
  statusLabels: Object.freeze({}),
});
