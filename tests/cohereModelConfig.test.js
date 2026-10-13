import {
  MODEL_OPTIONS as AGENT_MODEL_OPTIONS,
  defaultModelForProvider,
} from '../src/components/agent/AgentData.js';
import { MODEL_OPTIONS as DESIGNER_MODEL_OPTIONS } from '../src/components/windows/agentDesigner/modelConfig.js';

describe('Cohere model configuration', () => {
  test('makes North Mini Code the default Cohere model everywhere agents are configured', () => {
    expect(defaultModelForProvider('cohere')).toBe('north-mini-code-1-0');
    expect(AGENT_MODEL_OPTIONS.cohere[0]).toMatchObject({
      value: 'north-mini-code-1-0',
    });
    expect(DESIGNER_MODEL_OPTIONS.cohere[0]).toMatchObject({
      value: 'north-mini-code-1-0',
    });
  });

  test('exposes the supported Cohere chat model IDs in both agent editors', () => {
    const expected = [
      'north-mini-code-1-0',
      'command-a-plus-05-2026',
      'command-a-03-2025',
      'command-a-reasoning-08-2025',
      'command-a-translate-08-2025',
      'command-a-vision-07-2025',
      'command-r-plus-08-2024',
      'command-r-08-2024',
      'command-r7b-12-2024',
    ];
    expect(AGENT_MODEL_OPTIONS.cohere.map((item) => item.value)).toEqual(expected);
    expect(DESIGNER_MODEL_OPTIONS.cohere.map((item) => item.value)).toEqual(expected);
  });
});
