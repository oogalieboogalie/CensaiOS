import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { TOOL_DEFINITIONS } from './definitions.js';
import { TOOL_REGISTRY } from './handlers/index.js';
import { registerHandAddedTool } from './rbac/hostOwnerOnly.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const log = createLogger('mcp-client');

export const activeServers = new Map(); // name -> connection

class McpServerConnection {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.process = null;
    this.requestId = 1;
    this.pendingRequests = new Map(); // id -> { resolve, reject }
    this.stdoutBuffer = '';
  }

  async connect() {
    const { command, args = [], env = {} } = this.config;
    // Arguments often carry an API key or token: log only the program's name and how many there are.
    log.info(`Connecting to MCP server: ${this.name}`, { program: path.basename(String(command || '')), argCount: args.length });

    this.process = spawn(command, args, {
      env: { ...process.env, ...env },
      shell: process.platform === 'win32'
    });

    this.process.stdout.on('data', (data) => {
      this.stdoutBuffer += data.toString();
      this.processIncomingMessages();
    });

    this.process.stderr.on('data', (data) => {
      log.debug(`MCP server ${this.name} wrote to its error output`, { chars: data.length });
    });

    this.process.on('close', (code) => {
      log.warn(`MCP server ${this.name} exited with code ${code}`);
      this.rejectAllPending(`MCP server exited with code ${code}`);
    });

    this.process.on('error', (err) => {
      log.error(`MCP server ${this.name} process error`, { code: safeErrorCode(err) });
      this.rejectAllPending(err.message);
    });

    // Initialize MCP Protocol
    await this.initializeProtocol();
  }

  async initializeProtocol() {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'CensaiHub',
        version: '0.1.0'
      }
    });

    log.info(`MCP server ${this.name} initialized successfully`, {
      protocolVersion: response.protocolVersion,
      serverInfo: response.serverInfo
    });

    this.sendNotification('notifications/initialized');
  }

  async listTools() {
    const response = await this.sendRequest('tools/list');
    return response.tools || [];
  }

  async callTool(toolName, args) {
    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    return response;
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.killed) {
        return reject(new Error('MCP server process is not running'));
      }

      const id = this.requestId++;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(message) + '\n');
    });
  }

  sendNotification(method, params = {}) {
    if (!this.process || this.process.killed) return;
    const message = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  processIncomingMessages() {
    let newlineIndex;
    while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (err) {
        log.error(`Failed to parse incoming MCP JSON message from ${this.name}`, { chars: line.length, code: safeErrorCode(err) });
      }
    }
  }

  handleMessage(message) {
    if (message.jsonrpc !== '2.0') return;

    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'Unknown JSON-RPC error'));
      } else {
        resolve(message.result);
      }
    }
  }

  rejectAllPending(reason) {
    for (const [id, { reject }] of this.pendingRequests.entries()) {
      reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }

  disconnect() {
    if (this.process && !this.process.killed) {
      this.process.kill();
      log.info(`MCP server disconnected: ${this.name}`);
    }
  }
}

export async function initializeMcpTools() {
  const configPath = path.join(__dirname, '../../config/mcp_servers.json');
  if (!fs.existsSync(configPath)) {
    log.info('No MCP server config found. Skipping.');
    return;
  }

  let configContent;
  try {
    configContent = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    log.error('Failed to parse the MCP config file', { code: safeErrorCode(err) });
    return;
  }

  const servers = configContent.mcpServers || {};
  for (const [serverName, serverConfig] of Object.entries(servers)) {
    const connection = new McpServerConnection(serverName, serverConfig);
    try {
      await connection.connect();
      activeServers.set(serverName, connection);

      const tools = await connection.listTools();
      log.info(`Loaded ${tools.length} tools from MCP server ${serverName}`);

      for (const mcpTool of tools) {
        const namespacedName = `mcp__${serverName}__${mcpTool.name}`;

        const definition = {
          type: 'function',
          function: {
            name: namespacedName,
            description: mcpTool.description || '',
            parameters: mcpTool.inputSchema || { type: 'object', properties: {} }
          }
        };

        if (TOOL_REGISTRY[namespacedName]) {
          log.warn(`MCP tool ${namespacedName} collides with an existing tool, skipping`);
          continue;
        }

        TOOL_DEFINITIONS.push(definition);
        // Owner-only for teammates unless the server marks it read-only.
        registerHandAddedTool(namespacedName, { looksOnly: mcpTool.annotations?.readOnlyHint === true });
        TOOL_REGISTRY[namespacedName] = async (agentId, name, args) => {
          log.debug(`Executing namespaced MCP tool: ${namespacedName}`);
          const response = await connection.callTool(mcpTool.name, args);
          
          if (response.isError) {
            const errorMsg = response.content?.[0]?.text || 'MCP call failed';
            throw new Error(errorMsg);
          }

          const textBlocks = (response.content || [])
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');

          return textBlocks;
        };
      }
    } catch (err) {
      log.error(`Failed to connect to MCP server: ${serverName}`, { code: safeErrorCode(err) });
      connection.disconnect();
    }
  }
}

export function shutdownMcpTools() {
  for (const connection of activeServers.values()) {
    connection.disconnect();
  }
  activeServers.clear();
}
