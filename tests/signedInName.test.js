import { authorName, noteSignedInName } from '../src/lib/collaboration/signedInName.js';

describe('the name a Doc note is signed with', () => {
  afterEach(() => noteSignedInName(null));

  it('is the signed-in person\'s name, so teammates see who wrote it', () => {
    noteSignedInName('Pat Example');
    expect(authorName()).toBe('Pat Example');
  });

  it('falls back to "You" with nobody signed in or a blank name', () => {
    expect(authorName()).toBe('You');
    noteSignedInName('   ');
    expect(authorName()).toBe('You');
  });

  it('keeps a long name to 64 letters', () => {
    noteSignedInName('M'.repeat(100));
    expect(authorName()).toHaveLength(64);
  });
});
