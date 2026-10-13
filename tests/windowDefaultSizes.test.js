import { WINDOW_SIZE_CLASSES } from '../src/lib/windowSizeClasses.js';
import { WINDOW_MANIFESTS, getDefaultWindowSize, FALLBACK_WINDOW_SIZE } from '../src/lib/windowManifest.js';
import { windowForArtifact } from '../src/lib/chat/artifacts.js';
import { DEFAULT_MODULE_SIZE, clampModuleSize } from '../src/lib/modules/moduleFormat.js';

// One table of opening sizes: every window kind opens at a shared size class
// (or its own bespoke 'fixed' size), whoever creates it.
const classSizes = new Set(Object.values(WINDOW_SIZE_CLASSES).map((s) => `${s.w}x${s.h}`));

describe('window default sizes', () => {
  test('every built-in kind opens at a size class unless it opts into a fixed shape', () => {
    for (const m of WINDOW_MANIFESTS) {
      if (m.sizeClass === 'fixed') continue;
      const s = getDefaultWindowSize(m.kind);
      expect(`${m.kind} ${s.w}x${s.h} ${classSizes.has(`${s.w}x${s.h}`)}`).toBe(`${m.kind} ${s.w}x${s.h} true`);
    }
  });

  test('unknown kinds, modules without a size and chat artifacts use the same table', () => {
    expect(getDefaultWindowSize('not-a-kind')).toEqual(WINDOW_SIZE_CLASSES.standard);
    expect(FALLBACK_WINDOW_SIZE).toEqual(WINDOW_SIZE_CLASSES.standard);
    expect(DEFAULT_MODULE_SIZE).toEqual(WINDOW_SIZE_CLASSES.compact);
    expect(clampModuleSize({})).toEqual(WINDOW_SIZE_CLASSES.compact);
    for (const type of ['code', 'image', 'sketch', 'file', 'text']) {
      expect(windowForArtifact({ type, path: 'a/b.js', src: 'x' }).size).toBeUndefined();
    }
  });
});
