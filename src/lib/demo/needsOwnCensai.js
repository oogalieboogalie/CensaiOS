// The one plain line Settings and Share show on the try-it board.
import { DEMO } from './demoMode.js';

export const NEEDS_OWN_CENSAI = 'Keys need your own censaiOS.';

/** True on the public try-it board (the demo build, or the flag installDemo sets). */
export function onTryItBoard() {
  return DEMO || globalThis.__censaiDemo === true;
}
