import {
  REDDIT_CATEGORIES, categoryIdForSource, feedUrlFor, normalizePost, normalizeSource,
  parseRedditInput, postsFromListing, sourceFromCategory, sourceKey, stepIndex,
} from '../shared/reddit/redditFeed.js';

describe('reddit feed helpers', () => {
  test('parses subreddit names, r/ links and home', () => {
    expect(parseRedditInput('pics')).toEqual({ type: 'subreddit', subreddit: 'pics', sort: 'hot', name: 'r/pics' });
    expect(parseRedditInput('r/science')).toMatchObject({ subreddit: 'science' });
    expect(parseRedditInput('https://www.reddit.com/r/AskReddit/new/')).toEqual({
      type: 'subreddit', subreddit: 'AskReddit', sort: 'new', name: 'r/AskReddit',
    });
    expect(parseRedditInput('home')).toEqual({ type: 'home', name: 'Home' });
    expect(parseRedditInput('https://example.com/x')).toBeNull();
  });

  test('builds feed URLs for home, popular and subreddits', () => {
    expect(feedUrlFor({ type: 'home' })).toBe('https://www.reddit.com/');
    expect(feedUrlFor({ type: 'popular' })).toBe('https://www.reddit.com/r/popular/');
    expect(feedUrlFor({ type: 'subreddit', subreddit: 'pics', sort: 'hot' })).toBe('https://www.reddit.com/r/pics/hot/');
  });

  test('categories map to sources and back', () => {
    const home = sourceFromCategory(REDDIT_CATEGORIES.find((c) => c.id === 'home'));
    expect(home).toEqual({ type: 'home', name: 'Home' });
    expect(categoryIdForSource(home)).toBe('home');
    const pics = sourceFromCategory(REDDIT_CATEGORIES.find((c) => c.id === 'pics'));
    expect(sourceKey(pics)).toBe('pics:hot');
    expect(categoryIdForSource(pics)).toBe('pics');
  });

  test('normalizes listing posts and drops NSFW', () => {
    const posts = postsFromListing({
      data: {
        children: [
          { data: { id: 'a1', title: 'Hello', author: 'alma', subreddit: 'pics', score: 12, permalink: '/r/pics/comments/a1/', over_18: false } },
          { data: { id: 'b2', title: 'Nope', over_18: true, subreddit: 'pics' } },
          { data: { id: 'c3', title: '', subreddit: 'pics' } },
        ],
      },
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: 'a1', title: 'Hello', kind: 'link' });
    expect(normalizePost({ data: { id: 'x', title: 'T', stickied: true } })).toBeNull();
  });

  test('steps stop at the ends', () => {
    expect(stepIndex(3, 0, -1)).toBe(0);
    expect(stepIndex(3, 2, 1)).toBe(2);
    expect(stepIndex(3, 1, 1)).toBe(2);
    expect(normalizeSource({ type: 'subreddit', subreddit: '!!' })).toBeNull();
  });
});
