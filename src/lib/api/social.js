// Social canvas: your profile, the boards you show off, who you follow,
// posts and your feed. The outside address other censaiOS installs read
// is built from the same outside base the agent Share panel uses.

import { shareRequest } from './shareLinks.js';

const base = '/api/social';

export const getSocialMe = () => shareRequest(`${base}/me`);
export const saveSocialProfile = (body) => shareRequest(`${base}/me`, { method: 'PUT', body });
export const showBoardOnProfile = (body) => shareRequest(`${base}/showcase`, { method: 'POST', body });
export const hideBoardFromProfile = (id) => shareRequest(`${base}/showcase/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const makeProfileKey = (label) => shareRequest(`${base}/keys`, { method: 'POST', body: { label } });
export const revokeProfileKey = (id) => shareRequest(`${base}/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const listSocialPeople = () => shareRequest(`${base}/people`);
export const followSocial = (body) => shareRequest(`${base}/follows`, { method: 'POST', body });
export const unfollowSocial = (id) => shareRequest(`${base}/follows/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getSocialFeed = () => shareRequest(`${base}/feed`);
export const postToFeed = (body) => shareRequest(`${base}/posts`, { method: 'POST', body });
export const deleteFeedPost = (id) => shareRequest(`${base}/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Shared with the agent Share panel: set a tunnel address once, both use it.
const OUTSIDE_BASE_KEY = 'censai.agentEndpoints.outsideBase';

export function outsideBase() {
  let saved = '';
  try { saved = globalThis.localStorage?.getItem(OUTSIDE_BASE_KEY) || ''; } catch { /* private window */ }
  return String(saved).trim().replace(/\/+$/, '') || globalThis.location?.origin || '';
}

export function profileAddress(profileId, origin = outsideBase()) {
  return `${origin}/api/social/v1/profiles/${profileId}`;
}
