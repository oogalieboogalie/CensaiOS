/**
 * POST /api/app-update/activity. The board calls this when someone types
 * or clicks. A custom header forces a browser to preflight, so a page on
 * another site cannot send a simple POST and look like someone is here.
 */

import { noteAppInput } from './inUse.js';

export function activityPost(req, res) {
  if (req.get('x-censai-client') !== '1') {
    res.status(403).json({ error: 'This request is not from censaiOS.' });
    return;
  }
  noteAppInput();
  res.json({ ok: true });
}
