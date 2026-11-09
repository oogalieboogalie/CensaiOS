// Shorts categories: themed shelves a person can pick without pasting a link.
// Each category is a channel's Shorts playlist (works without a YouTube API key).

export const SHORTS_CATEGORIES = Object.freeze([
  { id: 'space', label: 'Space', hint: 'NASA', channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ', name: 'NASA' },
  { id: 'science', label: 'Science', hint: 'Kurzgesagt', channelId: 'UCsXVk37bltHxD1rDPwtNM8Q', name: 'Kurzgesagt' },
  { id: 'physics', label: 'Physics', hint: 'Veritasium', channelId: 'UCHnyfMqiRRG1u-2MsSQLbXA', name: 'Veritasium' },
  { id: 'tech', label: 'Tech', hint: 'MKBHD', channelId: 'UCBJycsmduvYEL83R_U4JriQ', name: 'Marques Brownlee' },
  { id: 'ideas', label: 'Ideas', hint: 'TED-Ed', channelId: 'UCsooa4yRKGN_zEE8iknghZA', name: 'TED-Ed' },
  { id: 'nature', label: 'Nature', hint: 'Nat Geo', channelId: 'UCpVm7bg6pXKo1Pr6k5kxG9A', name: 'National Geographic' },
  { id: 'build', label: 'Build', hint: 'Mark Rober', channelId: 'UCY1kMZp36IQSyNx_9h4mpCg', name: 'Mark Rober' },
  { id: 'math', label: 'Math', hint: 'Numberphile', channelId: 'UCoxcjq-8xIDTYp3uz647V5A', name: 'Numberphile' },
]);

/** Channel source for a category id, or null. */
export function sourceFromCategoryId(id) {
  const cat = SHORTS_CATEGORIES.find((c) => c.id === id);
  if (!cat) return null;
  return { type: 'channel', channelId: cat.channelId, name: cat.name };
}

/** Which category matches the window's current source (by channel id). */
export function categoryIdForSource(source) {
  if (!source || source.type !== 'channel') return null;
  return SHORTS_CATEGORIES.find((c) => c.channelId === source.channelId)?.id || null;
}
