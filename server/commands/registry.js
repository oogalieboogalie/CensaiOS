import { operationalCommands } from './definitions/operational.js';
import { windowCommands } from './definitions/windows.js';
import { workspaceCommands } from './definitions/workspace.js';
import { checkCommandCapabilities } from '../capabilities/checkCapability.js';

const COMMANDS = [
  ...workspaceCommands,
  ...windowCommands,
  ...operationalCommands,
];

const COMMAND_MAP = new Map(COMMANDS.map(command => [command.id, command]));

function toMetadata(command) {
  return {
    id: command.id,
    title: command.title,
    description: command.description,
    inputSchema: command.inputSchema,
    outputSchema: command.outputSchema,
    requiredCapabilities: command.requiredCapabilities,
    sideEffects: command.sideEffects,
  };
}

export function listCommands() {
  return COMMANDS.map(toMetadata);
}

export function getCommand(commandId) {
  return COMMAND_MAP.get(commandId) || null;
}

export async function executeCommand(commandId, execution) {
  const command = getCommand(commandId);
  if (!command) throw new Error(`Unknown command: ${commandId}`);
  checkCommandCapabilities(command, execution.context);
  const result = await command.handler(execution);
  return { command: toMetadata(command), result };
}
