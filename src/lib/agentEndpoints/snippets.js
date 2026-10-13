// Copy-paste setup for the apps people use most. Pure, so it is tested.
// `key` is the plain key right after it is made; later it is a placeholder.

export const KEY_PLACEHOLDER = '<your agent key>';

export function serverName(agentName) {
  const slug = String(agentName || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `censai-${slug || 'agent'}`;
}

export function trimBase(base) {
  return String(base || '').trim().replace(/\/+$/, '');
}

export function endpointUrls(base, endpoint) {
  const root = trimBase(base);
  return { mcp: `${root}${endpoint.mcpPath}`, ask: `${root}${endpoint.askPath}` };
}

export function setupSnippets({ base, endpoint, key, relayAddress = null }) {
  const token = key || KEY_PLACEHOLDER;
  const name = serverName(endpoint.agentName);
  const { mcp, ask } = endpointUrls(base, endpoint);
  const json = (value) => JSON.stringify(value, null, 2);
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      hint: 'Run this once in a terminal.',
      text: `claude mcp add --transport http ${name} ${mcp} --header "Authorization: Bearer ${token}"`,
    },
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      hint: 'Settings, Developer, Edit config. Add this inside claude_desktop_config.json, then restart Claude.',
      text: json({
        mcpServers: {
          [name]: {
            command: 'npx',
            args: ['-y', 'mcp-remote', mcp, '--header', 'Authorization:${AUTH_HEADER}'],
            env: { AUTH_HEADER: `Bearer ${token}` },
          },
        },
      }),
    },
    {
      id: 'cursor',
      label: 'Cursor',
      hint: 'Add this to .cursor/mcp.json in your project or home folder.',
      text: json({ mcpServers: { [name]: { url: mcp, headers: { Authorization: `Bearer ${token}` } } } }),
    },
    {
      id: 'http',
      label: 'Any app (HTTP)',
      hint: 'A plain web request, for scripts and tools without MCP.',
      text: `curl -X POST ${ask} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"message":"What should I work on next?"}'`,
    },
    {
      id: 'censaios',
      label: 'Another censaiOS',
      hint: 'On their censaiOS: Agent Registry, Publish, "Add an agent from another censaiOS". Paste both lines. Their agents can then ask this one, with a signed receipt on both sides.',
      text: `Address: ${relayAddress || mcp}\nKey: ${token}`,
    },
  ];
}

// The tunnel points at the agent-endpoints-only port, never the main app
// port, so only agents (each behind its key) are reachable from outside.
export function tunnelSteps(outsidePort) {
  const local = `http://localhost:${outsidePort || 3003}`;
  return [
    { id: 'install', label: 'Install Cloudflare Tunnel (free)', text: 'winget install --id Cloudflare.cloudflared' },
    { id: 'run', label: 'Open a tunnel to censaiOS', text: `cloudflared tunnel --url ${local}` },
  ];
}
