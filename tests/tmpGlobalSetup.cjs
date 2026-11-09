// Every test run gets its own temp folder, and it's deleted when the run ends.
// Tests make fake projects, git repos and exports in os.tmpdir(). Many never cleaned up, and on the homelab server
// /tmp is a RAM disk with room for ~1M files: it filled up and broke every test run and Claude session.
// os.tmpdir() reads TMPDIR, so pointing TMPDIR here catches every test and every git/node child it starts.
// Watch mode runs setup and teardown again for each re-run in the same process, so the first TMPDIR is kept
// in HOMEBASE_JEST_TMP_BASE and each run's folder is made there (teardown puts TMPDIR back).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

module.exports = async function tmpGlobalSetup() {
  if (process.env.HOMEBASE_JEST_TMP_BASE === undefined) process.env.HOMEBASE_JEST_TMP_BASE = os.tmpdir();
  const dir = fs.mkdtempSync(path.join(process.env.HOMEBASE_JEST_TMP_BASE, 'homebase-jest-'));
  process.env.HOMEBASE_JEST_TMP = dir;
  process.env.TMPDIR = dir;
};
