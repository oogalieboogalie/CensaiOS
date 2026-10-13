// Jest loader for Vite `?raw` imports.
//
// The registry imports SVG files with the `?raw` suffix, which Vite resolves
// to the file contents as a string at build time. In Jest there's no Vite,
// so this loader bridges the gap: it strips the query, reads the file from
// disk, and exports the contents as the module's default export.
//
// Jest invokes this loader with the FULL import specifier (including the
// `?raw` suffix) and a `context` object with the calling module's dirname,
// so we resolve the path against the importer, not against the project root.

const fs = require('node:fs');
const path = require('node:path');

module.exports = function rawSvgLoader(specifier, context) {
  // specifier looks like "../assets/agent-icons/architect.svg?raw"
  const cleanPath = specifier.split('?')[0];
  const importerDir = context && context.basedir ? context.basedir : process.cwd();
  const absPath = path.resolve(importerDir, cleanPath);
  const contents = fs.readFileSync(absPath, 'utf8');
  return {
    __esModule: true,
    default: contents,
  };
};