import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createLogger } from '../logger.js';
import { TOOL_DEFINITIONS } from './definitions.js';
import { TOOL_REGISTRY } from './handlers/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const log = createLogger('dynamic-tools');

export const dynamicToolsList = [];
export const dynamicHandlers = {};

export async function initializeDynamicTools() {
  const dynamicDir = path.join(__dirname, 'dynamic');
  
  if (!fs.existsSync(dynamicDir)) {
    try {
      fs.mkdirSync(dynamicDir, { recursive: true });
      log.info('Created server/tools/dynamic/ directory');
    } catch (err) {
      log.error('Failed to create server/tools/dynamic directory', { error: err.message });
    }
    return;
  }

  let files;
  try {
    files = fs.readdirSync(dynamicDir).filter(file => file.endsWith('.js'));
  } catch (err) {
    log.error('Failed to read server/tools/dynamic directory', { error: err.message });
    return;
  }

  log.info(`Found ${files.length} dynamic tool files`);

  for (const file of files) {
    const filePath = path.join(dynamicDir, file);
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      
      if (!module.definition || typeof module.handler !== 'function') {
        log.warn(`Dynamic tool ${file} is missing definition or handler exports`);
        continue;
      }

      const { definition, handler } = module;
      const toolName = definition.name;

      if (!toolName) {
        log.warn(`Dynamic tool ${file} has a definition with no name`);
        continue;
      }

      // Check for collisions
      if (TOOL_REGISTRY[toolName]) {
        log.warn(`Dynamic tool ${toolName} collides with a built-in tool, skipping`);
        continue;
      }

      const wrappedDefinition = {
        type: 'function',
        function: definition
      };
      
      TOOL_DEFINITIONS.push(wrappedDefinition);
      TOOL_REGISTRY[toolName] = handler;
      dynamicToolsList.push(wrappedDefinition);
      dynamicHandlers[toolName] = handler;

      log.info(`Successfully loaded dynamic tool: ${toolName} from ${file}`);
    } catch (err) {
      log.error(`Error loading dynamic tool ${file}`, { error: err.message });
    }
  }
}
