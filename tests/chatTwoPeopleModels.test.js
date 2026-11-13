// The two-people chat walk (launch blocker D) makes an agent in Agent Designer
// and then switches it to Grok from the chat's chip. It used to ask for two
// models by name. When the app's list of models changed, the walk could not
// find them and reported the chat as broken when it was not. It now takes both
// names from the app's own list.
import fs from 'node:fs';
import path from 'node:path';
import chatTwoPeople, { PLANNER } from '../scripts/test-team/modules/chatTwoPeople.mjs';
import { GROK_MODEL } from '../scripts/test-team/modules/grokSignIn.mjs';
import { MODEL_OPTIONS } from '../src/lib/agentModelOptions.js';

describe('the two-people chat walk picks models the app offers', () => {
  test('the model picked in Agent Designer is on the OpenAI list', () => {
    expect(MODEL_OPTIONS.openai.map((o) => o.value)).toContain(PLANNER.model);
  });

  test('the model picked from the chat chip is on the Grok list', () => {
    expect(MODEL_OPTIONS.xai.map((o) => o.value)).toContain(PLANNER.picked);
    expect(PLANNER.picked).not.toBe(PLANNER.model);
  });

  test('the Grok sign-in walk picks a model on the Grok list too', () => {
    expect(MODEL_OPTIONS.xai.map((o) => o.value)).toContain(GROK_MODEL);
  });

  test('neither name is typed into the walk by hand', () => {
    const text = fs.readFileSync(path.join(process.cwd(), 'scripts', 'test-team', 'modules', 'chatTwoPeople.mjs'), 'utf8');
    const line = text.split('\n').find((l) => l.startsWith('export const PLANNER'));
    expect(line).toContain('MODEL_OPTIONS.openai[0].value');
    expect(line).toContain('MODEL_OPTIONS.xai[0].value');
    expect(chatTwoPeople.id).toBe('chatTwoPeople');
  });
});
