// What a new Photo, Vector or Video window starts with when added from the
// Add palette: a white 1200 × 800 picture with one empty layer, an empty
// white artboard, an empty 1280 × 720 edit at 30 fps.
import { makePhotoDoc } from './photoModel.js';
import { makeVectorDoc } from './vectorModel.js';
import { makeVideoDoc } from './videoModel.js';

export const CREATIVE_STARTERS = Object.freeze({
  creativePhoto: { title: 'Untitled picture', ...makePhotoDoc() },
  creativeVector: { title: 'Untitled artwork', ...makeVectorDoc() },
  creativeVideo: { title: 'Untitled video', ...makeVideoDoc() },
});
