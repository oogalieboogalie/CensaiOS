// The app's log (server/appLog/): what the server, the board and its windows
// wrote down lately, for looking into a bug without guessing.
export const appLogTools = [
  {
    type: 'function',
    function: {
      name: 'read_app_log',
      description: 'Read the last lines of censaiOS\'s own log: server messages, plain console output, and the board\'s errors and warnings, each with a time, level and where it came from. Use it whenever someone reports something broken, sends a screenshot or an error, or asks why something failed: read the log around that time before answering, and say in plain words what it shows. Keys, tokens and emails are already cut out.',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'number', description: 'Only lines from the last this-many minutes (default 30)' },
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], description: 'Lowest level to show (default info; warn shows warnings and errors)' },
          source: { type: 'string', enum: ['server', 'browser', 'console'], description: 'Only lines from the server, the board in the browser, or plain console output (default all)' },
          search: { type: 'string', description: 'Only lines containing these words, e.g. a window name, a route like /api/todos, or part of the error' },
          lines: { type: 'number', description: 'How many lines at most (default 80, max 300)' },
        },
      },
    },
  },
];
