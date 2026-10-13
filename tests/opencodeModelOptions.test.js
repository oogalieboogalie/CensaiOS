import {
  MODEL_OPTIONS as AGENT_MODEL_OPTIONS,
} from '../src/components/agent/AgentData.js';
import { MODEL_OPTIONS as DESIGNER_MODEL_OPTIONS } from '../src/components/windows/agentDesigner/modelConfig.js';

const EXPECTED_OPENCODE = [
  'muse-spark-1.3-contributor-free',
  'muse-spark-1.2-contributor-free',
  'mimo-v2.5-free',
  'ling-3.0-flash-fin-free',
  'nemotron-3-ultra-free',
  'nemotron-3.5-lightning-free',
  'big-pickle',
  'minimax-m2.5',
  'kimi-k2.5',
];

describe('OpenCode Zen model options', () => {
  test('both agent editors offer the same Zen free models, Spark first', () => {
    for (const options of [AGENT_MODEL_OPTIONS, DESIGNER_MODEL_OPTIONS]) {
      expect(options.opencode.map((item) => item.value)).toEqual(EXPECTED_OPENCODE);
      expect(options.opencode[0].label).toMatch(/free/i);
    }
  });
});
