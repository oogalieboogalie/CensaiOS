// The print check for what "Everything shown as STL" would save: true size
// (not the on-screen "Same size" scale) and Z up, the way a slicer reads it.
import { bakeWorldGeometry } from './printBake.js';
import { printCheck } from './printCheck.js';
import { poseForStl } from './modelExport.js';

export function checkShown(stage) {
  return poseForStl(stage, (root) => printCheck(bakeWorldGeometry(root)));
}
