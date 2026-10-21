// One figma-import line per import: the file key, how many frames the file
// held, and which frame was imported. A share link whose frame is not in the
// file is a warning. Never the token, the frame's text, or a person's name.

import { createLogger } from '../logger.js';

const log = createLogger('figma-import');

export function logFigmaImport({ fileKey, framesFound, imported }) {
  const found = framesFound == null ? 'unknown' : String(Number(framesFound) || 0);
  log.info(`import file ${fileKey}: ${found} frames found, imported ${imported}`, {
    fileKey,
    framesFound: framesFound == null ? null : Number(framesFound) || 0,
    imported,
  });
}

export function logFigmaFrameMissing({ fileKey, nodeId }) {
  log.warn(`link frame not found in file ${fileKey}: ${nodeId}`, { fileKey, nodeId });
}
