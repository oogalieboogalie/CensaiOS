// Deletes the run's temp folder made by tmpGlobalSetup.cjs, with everything tests left in it,
// and points TMPDIR back at the folder it started from (watch mode reuses this process).
const fs = require('node:fs');

module.exports = async function tmpGlobalTeardown() {
  const dir = process.env.HOMEBASE_JEST_TMP;
  if (dir && /homebase-jest-/.test(dir)) fs.rmSync(dir, { recursive: true, force: true });
  if (process.env.HOMEBASE_JEST_TMP_BASE) process.env.TMPDIR = process.env.HOMEBASE_JEST_TMP_BASE;
};
