export const skillSetTools = [
  {
    type: 'function',
    function: {
      name: 'skill_set_log',
      description: 'Note in a skill set\'s log what worked or what didn\'t while using it, in one plain sentence. Use it when one of your equipped skills clearly helped or clearly failed, so the skill set keeps getting better.',
      parameters: {
        type: 'object',
        properties: {
          skill_set: { type: 'string', description: 'Name or id of one of your equipped skill sets' },
          outcome: { type: 'string', enum: ['worked', 'didnt'], description: 'worked or didnt' },
          note: { type: 'string', description: 'What happened, one sentence, up to 600 characters' },
        },
        required: ['skill_set', 'outcome', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_go',
      description: 'Open a web page in the Browser window equipped to you on the board, so everyone watching sees it, and read the page\'s text back. Only works when someone has equipped a Browser window to you (the "Equip to" menu on the Browser window).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The web address (https://...) or a search phrase' },
          focus: { type: 'string', description: 'Optional: what you are looking for on the page' },
        },
        required: ['url'],
      },
    },
  },
];
