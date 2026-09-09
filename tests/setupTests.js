import 'dotenv/config';
import { TextEncoder, TextDecoder } from 'util';

// Mock canvas getContext which isn't present/functional in jsdom
// We do this BEFORE other imports to catch top-level calls
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: (x, y, w, h) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
    };
  };
}

// Fail tests on console.error or console.warn
const ignoredWarnings = [
  /Memory context .* skipped:/, // Allow optional schema warnings
];

const failTest = (type, args) => {
  const message = args[0] instanceof Error ? args[0].message : String(args[0]);
  if (type === 'warn' && ignoredWarnings.some(re => re.test(message))) {
    return;
  }
  throw new Error(`[FAIL] Console ${type} detected: ${message}\n${new Error().stack}`);
};

console.error = (...args) => failTest('error', args);
console.warn = (...args) => failTest('warn', args);

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

import '@testing-library/jest-dom';

// Dynamically import the database pool after polyfills are set
const { default: pool } = await import('../server/db.js');

// Close the database connection pool after all tests have run.
// This prevents the "Jest did not exit" error.
afterAll(async () => {
  if (pool && !pool.ended) {
    try {
      await pool.end();
    } catch (err) {
      // Ignore double-end errors
    }
  }
});

