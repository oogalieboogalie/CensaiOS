import fs from 'node:fs';
import path from 'node:path';

describe('AppContent initialization order', () => {
  test('initializes canvas actions before an effect dependency can read spawnAt', () => {
    const source = fs.readFileSync(path.resolve('src/app/AppContent.jsx'), 'utf8');
    const actions = source.indexOf('const { spawnAt, spawnGroup');
    const initializationEffect = source.indexOf('React.useEffect(() => {');

    expect(actions).toBeGreaterThan(-1);
    expect(initializationEffect).toBeGreaterThan(-1);
    expect(actions).toBeLessThan(initializationEffect);
  });

  test('receives the initialization setter owned by the bootstrap hook', () => {
    const appSource = fs.readFileSync(path.resolve('src/app/AppContent.jsx'), 'utf8');
    const hookSource = fs.readFileSync(path.resolve('src/app/hooks/useAppBootstrap.js'), 'utf8');
    expect(appSource).toContain('isInitialized, setIsInitialized, session');
    expect(hookSource).toContain('isInitialized, setIsInitialized, session');
  });
});
