import {
  getRuntimeMode,
  isCloudRuntime,
} from '../middleware/runtimeMode.js';

export function requiresPersonalApiKey(userRole, mode = getRuntimeMode()) {
  return isCloudRuntime(mode) && userRole !== 'admin';
}

export function getClientAccessPolicy(userRole, mode = getRuntimeMode()) {
  return {
    runtimeMode: mode,
    requiresUserApiKey: requiresPersonalApiKey(userRole, mode),
  };
}
