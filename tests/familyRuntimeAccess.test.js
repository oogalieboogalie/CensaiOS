import {
  enforceCoreChatBoundary,
  requireAgentContextRuntime,
  requireFamilyAgentIds,
  requireFamilyRows,
} from '../server/agents/familyRuntimeAccess.js';

describe('family runtime access boundary', () => {
  test('accepts exact canonical ids and complete database rows', () => {
    expect(requireFamilyAgentIds(['atlas', 'censai'])).toEqual(['atlas', 'censai']);
    expect(requireFamilyRows(
      ['atlas', 'censai'],
      [{ id: 'atlas' }, { id: 'censai' }],
    )).toHaveLength(2);
  });

  test.each([
    [() => requireFamilyAgentIds(['atlas', 'atlas']), 'FAMILY_AGENT_DUPLICATE', 400],
    [() => requireFamilyAgentIds(['guardian']), 'FAMILY_AGENT_NOT_FOUND', 404],
    [() => requireFamilyRows(['atlas'], []), 'FAMILY_AGENT_UNAVAILABLE', 503],
    [() => requireAgentContextRuntime(false), 'AGENT_CONTEXT_UNAVAILABLE', 503],
  ])('fails closed at the runtime boundary', (operation, code, statusCode) => {
    expect(operation).toThrow(expect.objectContaining({ code, statusCode }));
  });

  test('hides global non-family agents from ordinary cloud users', () => {
    expect(() => enforceCoreChatBoundary({
      agentId: 'guardian',
      agent: { id: 'guardian' },
      userRole: 'user',
      mode: 'cloud_saas',
    })).toThrow(expect.objectContaining({ code: 'FAMILY_AGENT_NOT_FOUND', statusCode: 404 }));
  });

  test.each([
    ['admin', 'cloud_saas'],
    ['user', 'local_desktop'],
  ])('retains privileged or local non-family access for %s in %s', (userRole, mode) => {
    expect(enforceCoreChatBoundary({
      agentId: 'custom-agent', agent: { id: 'custom-agent' }, userRole, mode,
    })).toBeNull();
  });
});
