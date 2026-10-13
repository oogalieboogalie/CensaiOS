import { filterToolsForAgent } from '../rbac/checks.js';
import { listToolCatalog } from '../catalog.js';
import { searchToolCatalog } from '../toolSearch.js';

function allowedCatalog(toolDefinitions) {
  const allowed = new Set(toolDefinitions.map(tool => tool.function.name));
  return listToolCatalog().tools.filter(tool => allowed.has(tool.name));
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

  return JSON.stringify({ error: `Unknown discovery tool: ${name}` });
}
