// Stands in for node:crypto when the try-it board bundles the starter
// boards (vite.demo.config.js). Only randomUUID is used there.
export const randomUUID = () => globalThis.crypto.randomUUID();
