export const moduleTools = [
  {
    type: 'function',
    function: {
      name: 'make_module',
      description: 'Build a small working app (a "module") from a plain-language request and open it as a window on the shared canvas, for example a tip calculator, a listing pipeline board, a pomodoro timer or a habit tracker. The module runs in a sandbox, matches the user\'s theme, saves its data on the canvas, and everyone on the board sees it appear. Use this whenever the user asks for a tool, app, tracker, calculator, board, timer or game, instead of writing code into the chat. Pass the request in the user\'s own words plus any details from the conversation. Takes up to a minute.',
      parameters: {
        type: 'object',
        properties: {
          request: { type: 'string', description: 'What the module should do, in plain language (max 2000 chars). Include details the user gave: fields, stages, defaults.' },
          title: { type: 'string', description: 'Optional short window title while it builds (max 60 chars)' },
          near_window_id: { type: 'string', description: 'Optional id of a window to place the module next to' },
        },
        required: ['request'],
      },
    },
  },
];
