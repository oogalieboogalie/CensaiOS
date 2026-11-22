// The environment a command an agent runs gets: this app's own, minus anything
// that looks like a key, a password or a database address. Same names as the
// terminal drops (server/terminal/shared.js). A command an agent runs in the
// app's own process (server/runner/hereForRun.js) must never carry the app's
// keys to a test script or a shell line someone else wrote.
const SECRET_ENV_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|_KEY$|PRIVATE|CREDENTIAL|DATABASE_URL|COOKIE/i;

/** `env` without its secret-looking names. */
export function cleanEnv(env = process.env) {
  const clean = {};
  for (const [name, value] of Object.entries(env)) {
    if (!SECRET_ENV_NAME.test(name)) clean[name] = value;
  }
  return clean;
}
