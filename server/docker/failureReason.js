// Docker's own error text can repeat what the person typed in the Run
// settings (an environment setting's name or value, a shared folder's path),
// so the app log gets one fixed reason instead. The full error still goes
// back to the person in the window.
import { DockerInputError, DockerUnavailableError } from './cli.js';

const REASONS = [
  ['image not found', /unable to find image|pull access denied|manifest unknown|manifest for .* not found|repository does not exist|no such image/i],
  ['port in use', /port is already allocated|address already in use|bind for .* failed/i],
  ['name taken', /is already in use by container|conflict\. the container name/i],
  ['Docker not running', /cannot connect to the docker daemon|is the docker daemon running|error during connect|docker daemon is not running|spawn docker enoent/i],
  ['no such container', /no such container/i],
  ['still in use', /is in use|is being used/i],
];

/** One of a fixed set of reasons, never Docker's own words. */
export function dockerFailureReason(err) {
  if (err instanceof DockerInputError) return 'refused before Docker ran';
  if (err instanceof DockerUnavailableError) return 'Docker not running';
  const text = String(err?.stderr || '') + '\n' + String(err?.message || '');
  return REASONS.find(([, pattern]) => pattern.test(text))?.[0] || 'other';
}
