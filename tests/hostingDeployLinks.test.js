// Deploy buttons in Places to Host (diagram 18). Each button only
// opens the service's own page: Render and Cloud Run with the repo filled
// in, Railway at its repo picker. Nothing deploys from censaiOS itself.
import { describe, expect, test } from '@jest/globals';
import { deployLink, githubRepoUrl, hasDeployButton } from '../src/lib/hosting/deployLinks.js';

describe('deploy buttons (diagram 18)', () => {
  test('owner/repo and github.com addresses both read; anything else does not', () => {
    expect(githubRepoUrl('jordan-demo/censaios')).toBe('https://github.com/jordan-demo/censaios');
    expect(githubRepoUrl(' https://github.com/jordan-demo/censaios.git/ ')).toBe('https://github.com/jordan-demo/censaios');
    expect(githubRepoUrl('https://gitlab.com/jordan-demo/censaios')).toBe('');
    expect(githubRepoUrl('jordan-demo/censaios/../x')).toBe('');
    expect(githubRepoUrl('jordan-demo/..')).toBe('');
    expect(githubRepoUrl('-bad/censaios')).toBe('');
    expect(githubRepoUrl('')).toBe('');
  });

  test('Render and Cloud Run open with the repo filled in', () => {
    expect(deployLink('render', 'jordan-demo/censaios')).toMatchObject({
      href: 'https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fjordan-demo%2Fcensaios', label: 'Deploy on Render', prefilled: true,
    });
    expect(deployLink('cloudrun', 'jordan-demo/censaios').href)
      .toBe('https://deploy.cloud.run/?git_repo=https%3A%2F%2Fgithub.com%2Fjordan-demo%2Fcensaios');
    expect(deployLink('render', 'not a repo')).toBeNull();
  });

  test('Railway opens its picker without a repo', () => {
    expect(deployLink('railway', '')).toMatchObject({ href: 'https://railway.com/new/github', prefilled: false });
  });

  test('every button says what it will do, and only the three get one', () => {
    for (const id of ['render', 'cloudrun', 'railway']) {
      expect(hasDeployButton(id)).toBe(true);
      expect(deployLink(id, 'jordan-demo/censaios').says).toMatch(/Opens/);
    }
    for (const id of ['docker', 'kubernetes', 'supabase', 'jupyter', 'toString']) {
      expect(hasDeployButton(id)).toBe(false);
      expect(deployLink(id, 'jordan-demo/censaios')).toBeNull();
    }
  });
});
