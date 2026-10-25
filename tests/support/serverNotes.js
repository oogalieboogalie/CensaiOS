import { jest } from '@jest/globals';

// Shared by the serverNotes*.test.js files: a stand-in app logger that keeps
// every line, and a watch on the raw console so a test can prove a failure
// reached the app log and not the console.
export function stubLogger() {
  const lines = [];
  const logger = {
    createLogger: (namespace) => {
      const write = (level) => (msg, meta) => lines.push({ namespace, level, msg, meta });
      return { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {} };
    },
  };
  return { lines, logger };
}

export function watchConsole() {
  return ['log', 'info', 'warn', 'error'].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
}

export function consoleCalls(spies) {
  return spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
}
