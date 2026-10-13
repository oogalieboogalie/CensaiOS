import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { WINDOW_REGISTRY } from '../src/lib/windowRegistry.js';
import { WINDOW_TYPES } from '../src/components/windows/windowRegistry.js';

describe('window registry harness', () => {
  test('every manifest window has registry metadata', () => {
    const missing = WINDOW_MANIFESTS
      .map((manifest) => manifest.kind)
      .filter((kind) => !WINDOW_REGISTRY[kind]);

    expect(missing).toEqual([]);
  });

  test('every manifest canvas type alias has registry metadata', () => {
    const missing = WINDOW_MANIFESTS
      .map((manifest) => manifest.canvasType || manifest.kind)
      .filter((kind) => !WINDOW_REGISTRY[kind]);

    expect(missing).toEqual([]);
  });

  test('every renderable window type has registry metadata', () => {
    const missing = Object.keys(WINDOW_TYPES).filter((kind) => !WINDOW_REGISTRY[kind]);

    expect(missing).toEqual([]);
  });

  test('registry sizes match manifest defaults', () => {
    for (const manifest of WINDOW_MANIFESTS) {
      expect(WINDOW_REGISTRY[manifest.kind].defaultSize).toEqual(manifest.defaultSize);
      expect(WINDOW_REGISTRY[manifest.canvasType || manifest.kind].defaultSize).toEqual(manifest.defaultSize);
    }
  });
});
