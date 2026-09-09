import {
  WINDOW_MANIFEST_BY_KIND,
  WINDOW_REGISTRY,
  LAUNCHER_MANIFESTS,
  buildWindowLabObject,
} from '../src/lib/windowManifest.js';

describe('registry test window contract', () => {
  const manifest = WINDOW_MANIFEST_BY_KIND.registryTestWindow;

  test('declares the expected manifest metadata', () => {
    expect(manifest).toMatchObject({
      kind: 'registryTestWindow',
      canvasType: 'registryTestWindow',
      label: 'Registry Test Window',
      componentName: 'RegistryTestWindow',
      componentPath: 'src/components/RegistryTestWindow.jsx',
      defaultSize: { w: 400, h: 300 },
    });
  });

  test('is derived into runtime registry metadata', () => {
    expect(WINDOW_REGISTRY.registryTestWindow).toMatchObject({
      componentKey: 'RegistryTestWindow',
      title: 'Registry Test Window',
      defaultSize: { w: 400, h: 300 },
    });
  });

  test('appears in the launcher manifests', () => {
    const launcher = LAUNCHER_MANIFESTS.find((entry) => entry.kind === 'registryTestWindow');
    expect(launcher).toBeTruthy();
    expect(launcher.launcher).toMatchObject({
      show: true,
      label: 'Registry Test Window',
      hint: 'test window',
    });
  });

  test('builds a lab window object without extra wiring', () => {
    expect(buildWindowLabObject('registryTestWindow')).toMatchObject({
      kind: 'registryTestWindow',
      type: 'registryTestWindow',
      title: 'Registry Test Window',
      w: 400,
      h: 300,
    });
  });
});
