// YorWare CAD agent tools (spec 13): read a part on the shared canvas and
// change its recipe or sizes. The browsers with the window open build it.
import { RECIPE_GUIDE } from '../../collaboration/cadAgent.js';

export const cadTools = [
  {
    type: 'function',
    function: {
      name: 'read_cad_part',
      description: 'Read a CAD part on the shared canvas: its recipe (JavaScript on replicad), the sizes dialed in, and whether the last build worked (size, volume, or the error). Find CAD windows with canvas_window_index; their kind is yorCad.',
      parameters: {
        type: 'object',
        properties: { window_id: { type: 'string', description: 'Exact id of the yorCad window (from canvas_window_index)' } },
        required: ['window_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_cad_part',
      description: `Change a CAD part on the shared canvas: replace its recipe, change some of its sizes, or both. Everyone with the window open sees the new part at once; read_cad_part afterwards says whether it built.\n${RECIPE_GUIDE}`,
      parameters: {
        type: 'object',
        properties: {
          window_id: { type: 'string', description: 'Exact id of the yorCad window' },
          code: { type: 'string', description: 'The whole new recipe (leave out to keep the current one)' },
          params: { type: 'object', description: 'Sizes to change, by name from the recipe\'s params, e.g. { "width": 60 }. null puts one back to the recipe\'s value.' },
        },
        required: ['window_id'],
      },
    },
  },
];
