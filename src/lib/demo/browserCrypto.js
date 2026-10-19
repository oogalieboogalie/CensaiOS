// Stands in for node:crypto when the try-it board bundles the starter
// boards (vite.demo.config.js). Only randomUUID is used there.
import { newId } from '../ids/newId.js';

export const randomUUID = () => newId();
