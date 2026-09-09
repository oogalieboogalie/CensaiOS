/**
 * @typedef {Object} Agent
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {string} [glyph]
 * @property {string} [kind] - 'ai' | 'lead'
 * @property {number} [hue]
 * @property {string} [model_name]
 * @property {string} [model_provider]
 */
/**
 * @typedef {Object} Window
 * @property {string} id
 * @property {string} kind
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {string[]} [attachedAgents]
 * @property {boolean} [pinned]
 * @property {boolean} [closable]
 * @property {number} [hue]
 * @property {Object} [data] - Kind-specific data
 */
/**
 * @typedef {Object} CanvasLink
 * @property {string} fromWindowId
 * @property {string} toAgentId
 */
/**
 * @typedef {Object} CanvasGroup
 * @property {string} id
 * @property {string} label
 * @property {number} hue
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {Object[]} [presets]
 * @property {string[]} [attachedAgents]
 * @property {string} [bgMode]
 * @property {string} [bgColor]
 * @property {Object} [root] - Layout tree
 */
/**
 * @typedef {Object} Workspace
 * @property {Window[]} wins
 * @property {CanvasGroup[]} canvasGroups
 * @property {Object[]} paths
 * @property {Object[]} groups
 * @property {number} dockOffset
 * @property {boolean} focusMode
 * @property {Agent[]} extraAgents
 * @property {string} penColor
 * @property {number} penSize
 * @property {boolean} penMode
 */
/**
 * @typedef {Object} JournalEntry
 * @property {string} ts
 * @property {string|null} project
 * @property {string} kind
 * @property {string} text
 */
/**
 * @typedef {Object} Preset
 * @property {string} id
 * @property {string} name
 * @property {string} createdAt
 * @property {Window[]} wins
 * @property {CanvasGroup[]} canvasGroups
 * @property {Object[]} paths
 * @property {Object[]} groups
 * @property {number} dockOffset
 * @property {Agent[]} extraAgents
 * @property {Object} pan
 * @property {number} zoom
 */
