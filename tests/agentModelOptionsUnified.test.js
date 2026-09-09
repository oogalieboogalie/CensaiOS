import { MODEL_OPTIONS as SINGLE } from '../src/lib/agentModelOptions.js';
import { MODEL_OPTIONS as FROM_AGENT_DATA } from '../src/components/agent/AgentData.js';
import { MODEL_OPTIONS as FROM_DESIGNER } from '../src/components/windows/agentDesigner/modelConfig.js';

describe('agent model options single source (idea 2026-09-04)', () => {
  test('both editors re-export the same object identity', () => {
    expect(FROM_AGENT_DATA).toBe(SINGLE);
    expect(FROM_DESIGNER).toBe(SINGLE);
  });
});
