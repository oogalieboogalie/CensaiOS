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

// Chat to module (manifest v3): agents read and drive sealed modules through
// the tools each module's manifest declares.
moduleTools.push(
  {
    type: 'function',
    function: {
      name: 'read_module',
      description: 'Look at the modules (small apps) on the shared canvas. With no window_id it lists them with their tools. With a window_id it tells you what that module is, what it may do, the tools you can press with use_module (and their inputs), and the data it has saved now. Read a module before you use it.',
      parameters: {
        type: 'object',
        properties: {
          window_id: { type: 'string', description: 'Optional id of one module window' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'use_module',
      description: 'Drive a module on the shared canvas by pressing one of the tools its manifest declares, for example add a listing to a listing pipeline or split a bill in a tip calculator. Everyone on the board watches it happen. The module runs in the browser, so this needs someone to have the board open. Call read_module first to see the module\'s tools and their inputs.',
      parameters: {
        type: 'object',
        properties: {
          window_id: { type: 'string', description: 'The module window id (from read_module)' },
          tool: { type: 'string', description: 'The tool name, exactly as read_module lists it' },
          input: { type: 'object', description: 'The tool\'s input fields' },
        },
        required: ['window_id', 'tool'],
      },
    },
  },
);
