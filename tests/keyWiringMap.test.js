import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The map of every place that calls an AI provider, and the one road each
// takes to the key saved in Settings (the user_api_keys vault, read by
// getUserApiKeyConfig). If a place stops taking its road this test names it.
// savedModelKey.test.js proves the callModel road with made-up keys;
// chatKeyScope, groupChatSavedKeys, modelArena, cliServerKeyScope,
// hostedAgentsRunTurn, aiGatewayImageGeneration and leadHoundRoute prove the
// others.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SURFACES = [
  ['Settings key screen saves here', 'server/routes/keys.js', 'user_api_keys'],
  ['the vault read every road ends at', 'server/security/userApiKeys.js', 'FROM user_api_keys'],
  ['Chat window', 'server/routes/chat/chatContext.js', 'applySavedChatKey'],
  ['Group chat', 'server/routes/chat/groupChatMembers.js', 'applySavedChatKey'],
  ['Atlas and the other agents', 'server/runEngine/index.js', 'prepareChatContext'],
  ['Censai orchestrator', 'server/censaiOrchestrator/model.js', 'prepareChatContext'],
  ['Workflows', 'server/workflows/runner.js', 'runAgentTurn'],
  ['Scheduler runs', 'server/agent-card-runs/executors/builtin.js', 'runAgentTurn'],
  ['MCP door (agent endpoints)', 'server/agentEndpoints/runAgent.js', 'runAgentTurn'],
  ['Model Arena', 'server/modelArena/runLane.js', 'getUserApiKeyConfig'],
  ['Agent Arena (Legion)', 'server/legion/modelCall.js', 'laneConfig'],
  ['Hosted agents', 'server/hostedAgents/runTurn.js', 'getUserApiKeyConfig'],
  ['Voice and dictation', 'server/routes/chat/chatTarget.js', 'getUserApiKeyConfig'],
  ['Image making', 'server/routes/images/index.js', 'imageConfigForCaller'],
  ['Video making', 'server/video/service.js', 'getUserApiKeyConfig'],
  ['LeadHound search', 'server/leadhound/tavily.js', 'getUserApiKeyConfig'],
  ['Command-line agents', 'server/cli-agents/index.js', 'getUserApiKeyConfig'],
  ['callModel (every road below)', 'server/aiGateway/callModel.js', 'useSavedKey'],
  ['Idea Pad expand', 'server/routes/chat/handlers.js', 'createModelAccessContext'],
  ['LeadHound writing step', 'server/routes/agents/leadhound.js', 'createModelAccessContext'],
  ['Agent icons', 'server/routes/agentIcons.js', 'createModelAccessContext'],
  ['Design remix', 'server/routes/design.js', 'createModelAccessContext'],
  ['Agent wake-ups', 'server/agent-wakeups/modelLoop.js', 'createModelAccessContext'],
  ['Module making', 'server/modules/generator.js', 'createModelAccessContext'],
  ['Task workers', 'server/task-worker/execution.js', 'createModelAccessContext'],
];

describe('every AI call takes the road to the saved key', () => {
  test.each(SURFACES)('%s (%s)', (_name, file, road) => {
    expect(read(file)).toContain(road);
  });

  test('callModel looks in the vault before the setup-file key is checked', () => {
    const source = read('server/aiGateway/callModel.js');
    expect(source).toMatch(/scopeServerKey\(keyed,/);
    expect(source.indexOf('useSavedKey(config, userId)')).toBeGreaterThan(-1);
  });
});

function serverFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : serverFiles(rel);
    return /\.(m?js)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [rel] : [];
  });
}

describe('no AI key comes from an old file or folder', () => {
  const files = serverFiles('server');

  test('nothing in server/ opens the .env file itself (one loader: secrets.js)', () => {
    const opens = files.filter((file) => /readFile(Sync)?\([^)]*['"`][^'"`]*\.env['"`]/.test(read(file)));
    expect(opens).toEqual([]);
  });

  test('provider keys are read through getSecret or the vault, never process.env directly', () => {
    const names = /process\.env\.(ANTHROPIC|OPENAI|GEMINI|GOOGLE|XAI|OPENROUTER|MOONSHOT|ZAI|OPENCODE|COHERE|TAVILY|ELEVENLABS)_API_KEY\b/;
    expect(files.filter((file) => names.test(read(file)))).toEqual([]);
  });
});
