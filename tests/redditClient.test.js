import { jest } from '@jest/globals';
import { redditListing } from '../server/redditClient.js';

describe('redditListing', () => {
  test('fetches a public subreddit JSON listing through the injectable fetch', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          children: [
            { data: { id: 'z1', title: 'Orbit', author: 'nasa', subreddit: 'spaceporn', score: 100, permalink: '/r/spaceporn/comments/z1/', over_18: false } },
          ],
        },
      }),
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    const out = await redditListing('spaceporn', 'hot', { fetchImpl, resolve });
    expect(out.posts).toHaveLength(1);
    expect(out.posts[0].title).toBe('Orbit');
    expect(out.url).toContain('/r/spaceporn/');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/r/spaceporn/hot.json');
  });

  test('rejects a bad subreddit name before calling the network', async () => {
    await expect(redditListing('!!', 'hot', { fetchImpl: jest.fn() })).rejects.toMatchObject({
      code: 'REDDIT_BAD_SUBREDDIT',
    });
  });
});
