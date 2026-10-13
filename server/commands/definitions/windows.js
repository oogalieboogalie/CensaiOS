import { validateGeneratedWindow } from '../../window-import/validation.js';

export const windowCommands = [
  {
    id: 'window.import.validate',
    title: 'Validate generated window import',
    description: 'Scans generated JSX/CSS for blocked APIs before any source-writing route runs.',
    inputSchema: {
      type: 'object',
      required: ['rawJsx'],
      properties: {
        kind: { type: 'string' },
        label: { type: 'string' },
        rawJsx: { type: 'string' },
        rawCss: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        suggestedKind: { type: 'string' },
        componentName: { type: 'string' },
        issues: { type: 'array' },
      },
    },
    requiredCapabilities: ['window.import'],
    sideEffects: [],
    async handler({ input, context }) {
      const validation = validateGeneratedWindow(input);
      return {
        ...validation,
        runtimeMode: context.runtimeMode,
      };
    },
  },
];
