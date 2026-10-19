import { filterToolsForAgent } from '../rbac/checks.js';
import { listToolCatalog } from '../catalog.js';
import { searchToolCatalog } from '../toolSearch.js';

function allowedCatalog(toolDefinitions) {
  const allowed = new Set(toolDefinitions.map(tool => tool.function.name));
  return listToolCatalog().tools.filter(tool => allowed.has(tool.name));
}

// "Coding Operations", "coding-operations" and "coding operations" are the same kit.
function kitKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function handleToolDiscovery(agentId, name, args = {}, context = {}) {
  const permittedDefinitions = await filterToolsForAgent(agentId, context);
  const tools = allowedCatalog(permittedDefinitions);

  if (name === 'search_tools') {
    const matches = searchToolCatalog(tools, args.query, {
      kit: args.kit,
      type: args.type,
      limit: args.limit,
    });
    return JSON.stringify({
      query: args.query,
      count: matches.length,
      tools: matches.map(tool => ({
        name: tool.name,
        description: tool.description,
        type: tool.type,
        kit: tool.kit,
        tags: tool.tags,
      })),
    });
  }

  if (name === 'get_tool') {
    const tool = tools.find(candidate => candidate.name === args.name);
    if (!tool) return JSON.stringify({ error: `Tool not found or not permitted: ${args.name}` });
    return JSON.stringify(tool);
  }

  if (name === 'get_toolkit') {
    const wanted = kitKey(args.kit);
    const kitTools = tools.filter(tool => kitKey(tool.kit) === wanted && tool.type !== 'toolDiscovery');
    if (!kitTools.length) {
      const kits = [...new Set(tools.filter(tool => tool.type !== 'toolDiscovery').map(tool => tool.kit))].sort();
      return JSON.stringify({ error: `No kit called "${args.kit}" with tools you may use.`, kits });
    }
    return JSON.stringify({
      kit: kitTools[0].kit,
      count: kitTools.length,
      tools: kitTools.map(tool => ({ name: tool.name, description: tool.description, type: tool.type, tags: tool.tags })),
    });
  }

  return JSON.stringify({ error: `Unknown discovery tool: ${name}` });
}
