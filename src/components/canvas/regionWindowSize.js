import { getDefaultWindowSize } from '../../lib/windowManifest.js';

export function fitWindowSizeToRegion(kind, region, minimum = {}) {
  const defaults = getDefaultWindowSize(kind);
  return {
    w: Math.max(minimum.w ?? defaults.w, region.w),
    h: Math.max(minimum.h ?? defaults.h, region.h),
  };
}
