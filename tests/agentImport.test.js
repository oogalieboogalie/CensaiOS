import fs from 'node:fs';
import path from 'node:path';
import {
  AgentImportError,
  keysNeeded,
  parseAgentFile,
  toAgentPayload,
} from '../src/lib/agentImport/index.js';
import { mapTools, resolveModel } from '../src/lib/agentImport/mapping.js';
import { findPythonCalls } from '../src/lib/agentImport/python.js';

// Import agent: real exported definitions from Google ADK, OpenAI, Claude,
// Grok and ElevenLabs become board agents, with an honest list of what did
// and did not carry over.

const DIR = path.resolve('tests/fixtures/agent-import');
const read = (name) => parseAgentFile(fs.readFileSync(path.join(DIR, name), 'utf8'), { fileName: name });
const notCarriedNames = (agent) => agent.notCarried.map(item => item.name);

describe('Google ADK', () => {
  test('Python agent: constant instruction, google_search, own function left behind', () => {
    const { platform, agents } = read('google-adk-agent.py');
    expect(platform).toBe('google-adk');
    expect(agents).toHaveLength(1);
    const [agent] = agents;
    expect(agent).toMatchObject({ name: 'wayfinder', provider: 'google', model: 'gemini-2.5-flash', tools: ['web_search'] });
    expect(agent.description).toMatch(/Plans short trips/);
    expect(agent.instructions).toMatch(/^You are Wayfinder, a friendly travel concierge\.\nAsk where/);
    expect(notCarriedNames(agent)).toEqual(['get_exchange_rate']);
    expect(agent.notCarried[0].why).toMatch(/code lives on the original platform/);
  });

  test('YAML agent config: sub-agents and dotted custom tools are reported', () => {
    const [agent] = read('google-adk-agent.yaml').agents;
    expect(agent).toMatchObject({ platform: 'google-adk', name: 'support_triage', provider: 'google', model: 'gemini-2.5-pro', tools: ['web_search'] });
    expect(agent.instructions).toMatch(/refund, it is always billing/);
    expect(notCarriedNames(agent)).toEqual(['lookup_order', 'Sub-agent ./refund_agent.yaml']);
  });

  test('LiteLlm wrapper picks the right provider and every Agent in a file comes through, root first', () => {
    const src = `from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm
helper = Agent(name="helper", model=LiteLlm(model="anthropic/claude-sonnet-5-5"), instruction='Help.')
root_agent = Agent(name="boss", model="gemini-2.5-flash", instruction="Lead.", sub_agents=[helper])
`;
    const { agents } = parseAgentFile(src);
    expect(agents.map(a => a.name)).toEqual(['boss', 'helper']);
    expect(agents[1]).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(notCarriedNames(agents[0])).toContain('Sub-agent helper');
  });
});

describe('OpenAI', () => {
  test('assistant JSON: hosted tools, files and temperature are left behind with reasons', () => {
    const [agent] = read('openai-assistant.json').agents;
    expect(agent).toMatchObject({ platform: 'openai', name: 'Ledger Buddy', provider: 'openai', model: 'gpt-4.1', tools: [] });
    expect(agent.instructions).toMatch(/Never give tax advice/);
    expect(notCarriedNames(agent)).toEqual(['code_interpreter', 'file_search', 'get_invoice', 'Attached files', 'Temperature']);
  });

  test('Agents SDK Python: WebSearchTool maps, function_tool stays behind', () => {
    const [agent] = read('openai-agents-sdk.py').agents;
    expect(agent).toMatchObject({ platform: 'openai', name: 'Market Scout', model: 'gpt-4.1-mini', tools: ['web_search'] });
    expect(agent.instructions).toBe('You research a market for a small business. Find three competitors, their prices, and one gap nobody covers.');
    expect(notCarriedNames(agent)).toEqual(['lookup_competitor']);
  });

  test('an assistants list response imports every assistant', () => {
    const list = { object: 'list', data: [{ name: 'A', instructions: 'a', model: 'gpt-4o' }, { name: 'B', instructions: 'b', model: 'o4-mini' }] };
    expect(parseAgentFile(JSON.stringify(list)).agents.map(a => a.name)).toEqual(['A', 'B']);
  });
});

describe('Claude', () => {
  test('subagent Markdown: read-only file tools map, Bash stays off', () => {
    const [agent] = read('claude-subagent.md').agents;
    expect(agent).toMatchObject({ platform: 'claude', name: 'code-reviewer', provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(agent.tools).toEqual(['project_read', 'project_file_outline', 'project_list', 'web_extract']);
    expect(agent.instructions).toMatch(/^You are a careful senior code reviewer\./);
    expect(notCarriedNames(agent)).toEqual(['Bash']);
  });

  test('Agent SDK JSON with two agents: model aliases and MCP tools', () => {
    const { agents } = read('claude-agent-sdk.json');
    expect(agents.map(a => [a.name, a.model])).toEqual([['launch-writer', 'claude-opus-5-5'], ['fact-checker', 'claude-sonnet-5-5']]);
    expect(agents[0].tools).toEqual(['web_search', 'web_extract']);
    expect(agents[1].notCarried[0]).toMatchObject({ name: 'mcp__notion__search' });
    expect(agents[1].notCarried[0].why).toMatch(/MCP/);
  });

  test('query options shape (systemPrompt + allowedTools)', () => {
    const [agent] = parseAgentFile(JSON.stringify({ systemPrompt: 'Be brief.', allowedTools: ['WebSearch'], model: 'haiku', mcpServers: { x: {} } })).agents;
    expect(agent).toMatchObject({ platform: 'claude', instructions: 'Be brief.', model: 'claude-haiku-5-5', tools: ['web_search'] });
    expect(notCarriedNames(agent)).toContain('MCP servers');
  });
});

describe('Grok', () => {
  test('grok model goes to the xAI provider; system message becomes the instructions', () => {
    const [agent] = read('grok-agent.json').agents;
    expect(agent).toMatchObject({ platform: 'grok', name: 'Trend Spotter', provider: 'xai', model: 'grok-4', tools: ['web_search'] });
    expect(agent.instructions).toMatch(/^You are Trend Spotter/);
    expect(keysNeeded(agent)).toEqual(['xai']);
  });
});

describe('ElevenLabs', () => {
  test('voice, first message and LLM carry over; phone-only tools do not', () => {
    const [agent] = read('elevenlabs-agent.json').agents;
    expect(agent).toMatchObject({
      platform: 'elevenlabs',
      name: 'Front Desk',
      provider: 'google',
      model: 'gemini-2.0-flash',
      voice: { provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM', model: 'eleven_flash_v2_5' },
    });
    expect(agent.instructions).toMatch(/open with: "Hi, thanks for calling Censai\./);
    expect(notCarriedNames(agent)).toEqual(['end_call', 'book_callback', 'Knowledge base', 'Phone and turn-taking settings', 'Website widget']);
    expect(keysNeeded(agent)).toEqual(['google', 'elevenlabs']);
  });
});

describe('detection, limits and saving', () => {
  test('the platform hint wins over detection', () => {
    const json = JSON.stringify({ name: 'X', instructions: 'Hi', model: 'mystery-1' });
    expect(parseAgentFile(json, { platform: 'grok' }).agents[0]).toMatchObject({ platform: 'grok', provider: 'xai', model: 'mystery-1' });
    expect(parseAgentFile(json).agents[0]).toMatchObject({ platform: 'openai', provider: 'openai' });
  });

  test('empty, huge and agent-less input give plain errors', () => {
    expect(() => parseAgentFile('  ')).toThrow(AgentImportError);
    expect(() => parseAgentFile('x'.repeat(600 * 1024))).toThrow(/too big/);
    expect(() => parseAgentFile('{}')).toThrow(/No agent found/);
    expect(() => parseAgentFile('---\nnot: [closed\n---\nbody', { fileName: 'a.md' })).toThrow(/no agent header/);
  });

  test('Python is read, never run', () => {
    const src = 'import os\nos.system("rm -rf /")\nroot_agent = Agent(name="safe", instruction="ok")';
    expect(parseAgentFile(src).agents[0]).toMatchObject({ name: 'safe', instructions: 'ok' });
  });

  test('payload for POST /api/agents keeps voice and the import receipt in tool scopes', () => {
    const [agent] = read('elevenlabs-agent.json').agents;
    const payload = toAgentPayload(agent, { id: 'front-desk', hue: 40 });
    expect(payload).toMatchObject({ id: 'front-desk', name: 'Front Desk', model_provider: 'google', model_name: 'gemini-2.0-flash', kind: 'ai', glyph: 'F' });
    expect(payload.system_prompt).toMatch(/front desk/);
    expect(payload.toolScopes).toMatchObject({ mode: 'custom', tools: ['report'], voice: { provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' } });
    expect(payload.toolScopes.imported).toMatchObject({ platform: 'elevenlabs' });
    expect(payload.toolScopes.imported.notCarried[0]).toMatch(/^end_call: /);
  });
});

describe('mapping helpers', () => {
  test('resolveModel', () => {
    expect(resolveModel('openai/gpt-4o', 'google')).toEqual({ provider: 'openai', model: 'gpt-4o', guessed: false });
    expect(resolveModel('x-ai/grok-4', 'google')).toMatchObject({ provider: 'xai', model: 'grok-4' });
    expect(resolveModel('meta-llama/llama-3', 'google')).toMatchObject({ provider: 'openrouter', model: 'meta-llama/llama-3' });
    expect(resolveModel('inherit', 'anthropic')).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', guessed: true });
    expect(resolveModel('glm-4.6', 'openai')).toMatchObject({ provider: 'zai', model: 'glm-4.6' });
    expect(resolveModel('', 'xai')).toMatchObject({ provider: 'xai', model: 'grok-4' });
  });

  test('mapTools reports every tool once, as carried or not', () => {
    const out = mapTools(['google_search', 'veo', { name: 'my_fn', kind: 'function' }, 'mystery']);
    expect(out.tools).toEqual(['web_search', 'make_video', 'video_status']);
    expect(out.carried).toHaveLength(2);
    expect(out.notCarried.map(n => n.name)).toEqual(['my_fn', 'mystery']);
  });

  test('python reader handles triple quotes, escapes, comments and nested brackets', () => {
    const src = `a = Agent(\n  name='x',  # comment, with comma\n  instruction="""line "one"\nline two""",\n  tools=[f(a=[1, 2]), g],\n)`;
    const [call] = findPythonCalls(src, ['Agent']);
    expect(call.variable).toBe('a');
    expect(call.args.keywords.instruction.value).toBe('line "one"\nline two');
    expect(call.args.keywords.tools.value.map(v => v.name || v.value)).toEqual(['f', 'g']);
  });
});
