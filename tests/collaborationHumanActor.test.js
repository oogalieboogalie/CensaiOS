import { collaborationHumanActor } from '../server/collaboration/humanActor.js';

describe('collaborationHumanActor', () => {
  test('teammates see the name someone signed in with', () => {
    expect(collaborationHumanActor({ userId: 7, userEmail: 'sam-x1@proof.dev', userName: 'Sam' }).label).toBe('Sam');
  });

  test('falls back to the email local part, then the member id', () => {
    expect(collaborationHumanActor({ userId: 7, userEmail: 'sam-x1@proof.dev' }).label).toBe('sam-x1');
    expect(collaborationHumanActor({ userId: 7, userName: '  ' }).label).toBe('Member 7');
  });
});
