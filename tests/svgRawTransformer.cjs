// Jest transformer that exports an SVG file as a raw string default export.
//
// Mirrors Vite's `?raw` semantics: `import x from './foo.svg'` returns the
// file contents as a string under the default export.
//
// Two interop quirks matter here:
//
//   1. Jest's synthetic CJS-to-ESM bridge sets the ESM `default` export to
//      the whole `module.exports` object, NOT to `.default`. So we have to
//      make the *whole* `module.exports` the string. Setting `module.exports =
//      "<svg...>"` lets `import x from './foo.svg?raw'` receive the string.
//
//   2. Vite's `?raw` query is passed in the filename as `foo.svg?raw`. We
//      strip the query and read the file on disk.

const fs = require('node:fs');

module.exports = {
  process(src, filename) {
    let cleanPath = filename;
    const queryIdx = filename.indexOf('?');
    if (queryIdx >= 0) cleanPath = filename.slice(0, queryIdx);
    const contents = fs.readFileSync(cleanPath, 'utf8');
    // The whole module.exports IS the default export under Jest's CJS-as-ESM
    // bridge. Exporting as a JSON-stringified assignment to module.exports
    // produces: module.exports = "<svg>...</svg>";
    return {
      code: `module.exports = ${JSON.stringify(contents)};\n`,
    };
  },
  getCacheKey(src, filename) {
    return filename;
  },
};