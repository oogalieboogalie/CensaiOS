// Auction Watcher: "AI pros and cons" also looks at the listing's photos, so a
// lock that only shows on a photo of the screen is caught. Fake listings only.
import { jest } from '@jest/globals';
import { goodwillPhotos } from '../server/auctionWatcher/details.js';
import { fetchPhoto } from '../server/auctionWatcher/fetcher.js';
import { matchInsights } from '../server/auctionWatcher/insights.js';

const photoReply = (type, bytes = 10) => ({ status: 200, headers: { get: () => type }, arrayBuffer: async () => new Uint8Array(bytes).buffer });

describe('listing photos', () => {
  test('Goodwill photo addresses become full addresses on its photo server', () => {
    expect(goodwillPhotos({ imageUrlString: 'Items/1/a.jpg;Items/1/b.jpg; ;http://evil.example/c.jpg', images: [{ url: 'https://shopgoodwillimages.azureedge.net/production/Items/1/a.jpg' }] }))
      .toEqual(['https://shopgoodwillimages.azureedge.net/production/Items/1/a.jpg', 'https://shopgoodwillimages.azureedge.net/production/Items/1/b.jpg']);
    expect(goodwillPhotos({})).toEqual([]);
  });

  test('only the two sites\' photo servers, only real photos, at most 3 MB', async () => {
    const fetchImpl = jest.fn(async () => photoReply('image/jpeg'));
    expect(await fetchPhoto('https://www.facebook.com/photo.jpg', { fetchImpl, env: {} })).toBeNull();
    expect(await fetchPhoto('http://i.ebayimg.com/images/g/fake.jpg', { fetchImpl, env: {} })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await fetchPhoto('https://i.ebayimg.com/images/g/fake.jpg', { fetchImpl, env: {} })).toMatch(/^data:image\/jpeg;base64,/);
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
    expect(await fetchPhoto('https://i.ebayimg.com/x.jpg', { fetchImpl: async () => photoReply('text/html'), env: {} })).toBeNull();
    expect(await fetchPhoto('https://i.ebayimg.com/y.jpg', { fetchImpl: async () => photoReply('image/png', 4 * 1024 * 1024), env: {} })).toBeNull();
  });
});

describe('AI pros and cons with photos', () => {
  const match = { id: 5, site: 'shopgoodwill', listing_id: '900000150', user_id: 3, title: 'Lenovo ThinkPad T495 14in Laptop', price: 52, bids: 3, image_url: 'https://shopgoodwillimages.azureedge.net/production/fake/t495.jpg' };
  const detail = { text: JSON.stringify({ description: 'Powers on. Comes with charger.', imageUrlString: 'fake/t495-screen.jpg' }) };
  const fetch = async () => detail;
  const photo = async (url) => `data:image/jpeg;base64,${Buffer.from(url).toString('base64')}`;

  test('the photos go to the model, and a lock it sees there raises the red flag', async () => {
    const complete = jest.fn(async () => '{"pros":["Cheap"],"cons":["Photo 2 shows a supervisor password prompt"],"verdict":"Skip it.","photoLock":"Photo 2 shows a supervisor password prompt."}');
    const out = await matchInsights(match, { complete, fetch, photo });
    const [, user] = complete.mock.calls[0][0];
    expect(user.content.filter((p) => p.type === 'image_url')).toHaveLength(2);
    expect(out).toMatchObject({ photosChecked: 2, photosNote: null, photoLock: 'Photo 2 shows a supervisor password prompt.', redFlags: ['lock seen in a photo'], readDescription: true });
  });

  test('a model that cannot take pictures is asked again with the words only', async () => {
    const complete = jest.fn(async (messages) => {
      if (Array.isArray(messages[1].content)) throw new Error('this model does not accept images');
      return '{"pros":["Cheap"],"cons":[],"verdict":"Fine.","photoLock":"made up"}';
    });
    const out = await matchInsights(match, { complete, fetch, photo });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(out.photosChecked).toBe(0);
    expect(out.photosNote).toMatch(/could not look at the photos/);
    expect(out.photoLock).toBeUndefined();
    expect(out.redFlags).toEqual([]);
  });

  test('no photos at all: words only, and the card says so', async () => {
    const complete = jest.fn(async () => '{"pros":[],"cons":[],"verdict":"Fine."}');
    const out = await matchInsights({ ...match, image_url: null }, { complete, fetch: async () => ({ text: '{}' }), photo });
    expect(typeof complete.mock.calls[0][0][1].content).toBe('string');
    expect(out).toMatchObject({ photosChecked: 0, photosNote: expect.stringMatching(/No photos/) });
  });
});
