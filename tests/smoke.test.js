import { describe, it, expect } from '@jest/globals';

describe('Smoke test — environment is alive', () => {
  it('math works', () => {
    expect(1 + 1).toBe(2);
  });

  it('ESM imports work', () => {
    expect(typeof describe).toBe('function');
  });

  it('can read env', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });

  it('can create objects', () => {
    const obj = { hello: 'world' };
    expect(obj.hello).toBe('world');
  });
});
