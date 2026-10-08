// Spec 9 "Make real": checks on the sketch image sent with a module request.
import { capabilityProviderFor, getModelCapabilities } from '../../src/lib/chat/modelCapabilities.js';

export const MAX_SKETCH_BYTES = 4 * 1024 * 1024;
const PNG_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;

/** Why this sketch can't go to this model, or null when it can. */
export function sketchProblem(sketch, config) {
  if (!PNG_DATA_URL.test(sketch)) {
    return { status: 400, code: 'MODULE_SKETCH_INVALID', error: 'The sketch must be a PNG, JPEG or WebP image.' };
  }
  if (Math.floor(((sketch.length - sketch.indexOf(',') - 1) * 3) / 4) > MAX_SKETCH_BYTES) {
    return { status: 413, code: 'MODULE_SKETCH_TOO_LARGE', error: 'The sketch image is larger than 4 MB.' };
  }
  const provider = capabilityProviderFor(config?.provider, config?.baseUrl);
  if (!getModelCapabilities(provider, config?.model).image) {
    return {
      status: 422,
      code: 'MODULE_SKETCH_NEEDS_VISION',
      error: `${config?.model || 'The module model'} can't read images. Pick a vision model (GPT-4o, Claude, Gemini) for the Censai agent to make sketches real.`,
    };
  }
  return null;
}
