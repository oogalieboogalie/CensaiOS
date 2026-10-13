import { ACCESSORIES, BODIES, COLOR_NAMES, EYES } from '../../../src/lib/weewoo/avatarParts.js';

// WeeWoo: an agent picks the pixel avatar it shows up as in the board's
// WeeWoo office.
export const weewooTools = [
  {
    type: 'function',
    function: {
      name: 'choose_avatar',
      description: 'Pick the pixel avatar you show up as in the WeeWoo office on this board, where every agent appears as a small character working in a department. Choose a body, a color, eyes and an accessory that suit who you are. Everyone on the board sees it right away; a person can still change it later.',
      parameters: {
        type: 'object',
        properties: {
          body: { type: 'string', enum: Object.keys(BODIES), description: 'Body shape' },
          color: { type: 'string', description: `A color name (${Object.keys(COLOR_NAMES).join(', ')}) or a #rrggbb hex color` },
          eyes: { type: 'string', enum: Object.keys(EYES), description: 'Eyes (default dots)' },
          accessory: { type: 'string', enum: Object.keys(ACCESSORIES), description: 'Accessory (default none)' },
          reason: { type: 'string', description: 'Optional: one short sentence on why you picked it' },
        },
        required: ['body', 'color'],
      },
    },
  },
];
