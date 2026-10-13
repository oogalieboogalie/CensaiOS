import {
  A2AAdapterError,
  inspectA2ACard,
} from '../server/agent-registry/adapters/a2aCard.js';
import {
  assertA2AEgressUrl,
  isRestrictedNetworkAddress,
} from '../server/agent-registry/adapters/egress.js';
import { RUNTIME_MODES } from '../server/middleware/runtimeMode.js';

function v03Card(overrides = {}) {
  return {
    protocolVersion: '0.3.0',
    name: 'Research Agent',
    description: 'Answers research questions.',
    version: '1.2.3',
    url: 'https://agent.example/a2a',
    preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{ id: 'research', name: 'Research', description: 'Research a topic.', tags: ['web'] }],
    ...overrides,
  };
}

describe('A2A Agent Card adapter', () => {
  test('validates a v0.3 JSON-RPC text agent as executable', () => {
    const result = inspectA2ACard(v03Card(), {
      cardUrl: 'https://agent.example/.well-known/agent-card.json',
    });
    expect(result).toEqual(expect.objectContaining({
      executable: true,
      protocolVersion: '0.3.0',
      endpoint: 'https://agent.example/a2a',
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  test('recognizes v1 cards for discovery but refuses premature execution', () => {
    const result = inspectA2ACard({
      name: 'Future Agent', description: 'A v1 agent.', version: '1.0.0',
      supportedInterfaces: [{ protocolVersion: '1.0', protocolBinding: 'JSONRPC', url: 'https://agent.example/v1' }],
      skills: [{ id: 'answer', name: 'Answer', description: 'Answer.', tags: [] }],
    }, { cardUrl: 'https://agent.example/.well-known/agent-card.json' });
    expect(result).toEqual(expect.objectContaining({
      executable: false, protocolVersion: '1.0', endpoint: 'https://agent.example/v1',
    }));
  });

  test('rejects authentication, non-text agents, and missing JSON-RPC transport', () => {
    expect(() => inspectA2ACard(v03Card({ security: [{ bearer: [] }] }), {
      cardUrl: 'https://agent.example/card',
    })).toThrow('Authenticated A2A agents are not supported');
    expect(() => inspectA2ACard(v03Card({ defaultOutputModes: ['image/png'] }), {
      cardUrl: 'https://agent.example/card',
    })).toThrow('must accept and return text');
    expect(() => inspectA2ACard(v03Card({ preferredTransport: 'GRPC' }), {
      cardUrl: 'https://agent.example/card',
    })).toThrow('no JSON-RPC interface');
    expect(() => inspectA2ACard(v03Card({ protocolVersion: '0.2.9' }), {
      cardUrl: 'https://agent.example/card',
    })).toThrow('not executable in this beta slice');
  });
});

describe('A2A egress policy', () => {
  test('blocks private networks and plain HTTP outside local desktop mode', async () => {
    const lookup = async () => [{ address: '10.1.2.3', family: 4 }];
    await expect(assertA2AEgressUrl('https://agent.example/card', {
      mode: RUNTIME_MODES.PRIVATE_SERVER, lookup,
    })).rejects.toMatchObject({ code: 'A2A_EGRESS_DENIED', statusCode: 403 });
    await expect(assertA2AEgressUrl('http://agent.example/card', {
      mode: RUNTIME_MODES.PRIVATE_SERVER,
    })).rejects.toMatchObject({ code: 'A2A_HTTPS_REQUIRED' });
  });

  test('allows loopback HTTP only in local desktop mode', async () => {
    const result = await assertA2AEgressUrl('http://127.0.0.1:4111/card', {
      mode: RUNTIME_MODES.LOCAL_DESKTOP,
    });
    expect(result.hostname).toBe('127.0.0.1');
    expect(isRestrictedNetworkAddress('127.0.0.1')).toBe(true);
    expect(isRestrictedNetworkAddress('::1')).toBe(true);
    expect(isRestrictedNetworkAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isRestrictedNetworkAddress('192.1.1.1')).toBe(false);
    expect(isRestrictedNetworkAddress('8.8.8.8')).toBe(false);
    expect(isRestrictedNetworkAddress('2606:4700:4700::1111')).toBe(false);
  });

  test('uses typed adapter errors for invalid URLs', async () => {
    await expect(assertA2AEgressUrl('file:///etc/passwd')).rejects.toBeInstanceOf(A2AAdapterError);
  });
});
