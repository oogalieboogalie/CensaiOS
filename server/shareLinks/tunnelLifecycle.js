// Closes the quick tunnel once nothing a guest can open is left.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { countActiveShareLinks } from './activeLinks.js';
import { closeBoardTunnel } from './boardTunnel.js';

const log = createLogger('board-door');

export async function releaseTunnelIfIdle(db) {
  try {
    if (await countActiveShareLinks(db) === 0) closeBoardTunnel();
  } catch (error) {
    log.warn('share tunnel was left as it was', { code: safeErrorCode(error) });
  }
}
