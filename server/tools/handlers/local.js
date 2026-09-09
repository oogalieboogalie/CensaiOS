import path from 'path';
import { getSecret } from '../../secrets.js';
import { recordProvenance } from '../../operational-intelligence/provenance.js';
import { runnerClient } from '../../runner/client.js';
import { getAgent, getSubAgentById } from '../../memory.js';
import { getProject } from '../../workspaces.js';

function isPathAllowed(targetPath, allowedPaths) {
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return true; // No restrictions
  }
  const resolvedTarget = path.resolve(targetPath);
  return allowedPaths.some(p => {
    const resolvedAllowed = path.resolve(p);
    const relative = path.relative(resolvedAllowed, resolvedTarget);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

export async function handleLocalTool(agentId, name, args, context = {}) {
  // Load agent scopes for directory path restriction
  let allowedPaths = null;
  let scopeLoadError = null;
  try {
    const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
    const agent = sub ? null : await getAgent(agentId);
    const toolScopes = sub ? sub.tool_scopes : agent?.tool_scopes;
    if (toolScopes?.scopes?.local?.paths) {
      allowedPaths = [...toolScopes.scopes.local.paths];
    }

    // Auto-bind to project path if agent is bound to a project
    const projectId = sub ? sub.project_id : agent?.project_id;
    if (projectId) {
      const proj = await getProject(projectId);
      if (proj && proj.path) {
        if (!allowedPaths) {
          allowedPaths = [];
        }
        if (!allowedPaths.includes(proj.path)) {
          allowedPaths.push(proj.path);
        }
      }
    }
  } catch (err) {
    scopeLoadError = err;
    console.warn(`[LocalTools] Failed to load agent scopes for ${agentId}:`, err.message);
  }

  if (scopeLoadError && ['local_list_dir', 'local_read_file', 'local_write_file'].includes(name)) {
    return `Failed to access local files: Unable to verify agent directory scopes (${scopeLoadError.message}).`;
  }

  switch (name) {
    case 'local_list_dir': {
      try {
        // Resolve relative paths against the server cwd (project root) so
        // agents don't have to guess the absolute root. Absolute paths pass
        // through unchanged.
        const abs = path.resolve(args.dir_path);
        if (allowedPaths && !isPathAllowed(abs, allowedPaths)) {
          return `Failed to read directory: Access restricted by agent's directory scopes. Allowed paths: ${allowedPaths.join(', ')}`;
        }
        const files = await runnerClient.fsList(abs);
        const listing = files.map(f => `${f.isDirectory ? '[DIR] ' : '[FILE]'} ${f.name}`).join('\n');
        const header = abs !== args.dir_path ? `(resolved to ${abs})\n` : '';
        return header + (listing || '(empty directory)');
      } catch (err) {
        return `Failed to read directory: ${err.message}`;
      }
    }
    case 'local_read_file': {
      try {
        const abs = path.resolve(args.file_path);
        if (allowedPaths && !isPathAllowed(abs, allowedPaths)) {
          return `Failed to read file: Access restricted by agent's directory scopes. Allowed paths: ${allowedPaths.join(', ')}`;
        }
        const content = await runnerClient.fsRead(abs);
        return content;
      } catch (err) {
        return `Failed to read file: ${err.message}`;
      }
    }
    case 'local_write_file': {
      try {
        const abs = path.resolve(args.file_path);
        if (allowedPaths && !isPathAllowed(abs, allowedPaths)) {
          return `Failed to write file: Access restricted by agent's directory scopes. Allowed paths: ${allowedPaths.join(', ')}`;
        }
        await runnerClient.fsWrite(abs, args.content);

        if (args.__provenance) {
          await recordProvenance({
            workspace_id: 'local',
            agent_id: args.__provenance.agent_id,
            prompt: args.__provenance.prompt,
            model: args.__provenance.model,
            code_snippet: args.content,
            file_path: args.file_path,
            metadata: { abs_path: abs }
          }).catch(err => console.error('[Provenance] Failed to record:', err.message));
        }

        return `Successfully wrote to ${abs}`;
      } catch (err) {
        return `Failed to write file: ${err.message}`;
      }
    }

    case 'web_search': {
      const apiKey = getSecret('TAVILY_API_KEY');
      if (!apiKey) return 'Error: TAVILY_API_KEY not configured in .env';
      try {
        const body = {
          query: args.query,
          search_depth: args.search_depth || 'basic',
          max_results: Math.min(args.max_results || 5, 10),
        };
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = await res.text();
          return `Search failed (${res.status}): ${errText}`;
        }
        const data = await res.json();
        const results = data.results || [];
        if (results.length === 0) return `No results found for "${args.query}".`;
        return results.map((r, i) =>
          `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.content}`
        ).join('\n\n');
      } catch (err) {
        return `Search error: ${err.message}`;
      }
    }

    case 'web_extract': {
      const apiKey = getSecret('TAVILY_API_KEY');
      if (!apiKey) return 'Error: TAVILY_API_KEY not configured in .env';
      const urls = Array.isArray(args.urls) ? args.urls.filter(u => typeof u === 'string' && u) : [];
      if (urls.length === 0) return 'Error: provide at least one URL in urls.';
      if (urls.length > 5) return 'Error: max 5 URLs per call — split into batches.';
      try {
        const res = await fetch('https://api.tavily.com/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            urls,
            query: args.query || undefined,
            extract_depth: 'advanced',
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return `Extract failed (${res.status}): ${errText}`;
        }
        const data = await res.json();
        const results = data.results || [];
        if (results.length === 0) return `No content extracted from ${urls.length} URL(s).`;
        return results.map((r, i) =>
          `[${i + 1}] ${r.url}\n${String(r.raw_content || '').slice(0, 4000)}`
        ).join('\n\n---\n\n');
      } catch (err) {
        return `Extract error: ${err.message}`;
      }
    }

    default:
      throw new Error(`Unknown local tool: ${name}`);
  }
}
