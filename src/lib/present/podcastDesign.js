// The design block for the podcast's "Design to code" scene: a small landing
// section written as plain HTML with inline styles, so it renders with no
// network (no Tailwind CDN) and reads well in any look. Restrained on
// purpose: one accent, no gradients.

export const PODCAST_DESIGN_HTML = `<section style="font-family: Inter, system-ui, sans-serif; background: #0d0d0f; color: #f4f4f5; min-height: 100vh; display: grid; place-items: center; padding: 48px; box-sizing: border-box;">
  <div style="max-width: 640px; text-align: center;">
    <p style="margin: 0 0 16px; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #22d3ee;">censaiOS</p>
    <h1 style="margin: 0 0 16px; font-size: 48px; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em;">The canvas for everyone, and everything.</h1>
    <p style="margin: 0 0 32px; font-size: 18px; line-height: 1.6; color: #a1a1aa;">Your team, your clients and your AI agents on one live board. Find leads with Tavily, write the outreach, ship the work.</p>
    <div style="display: inline-flex; gap: 12px;">
      <a style="padding: 12px 20px; border-radius: 8px; background: #f4f4f5; color: #0d0d0f; font-weight: 600; text-decoration: none;">Try the board</a>
      <a style="padding: 12px 20px; border-radius: 8px; border: 1px solid #3f3f46; color: #f4f4f5; text-decoration: none;">Watch the demo</a>
    </div>
  </div>
</section>`;

export const LOOK_NOTES = [
  '# Make it yours',
  '',
  'Pick a look on the left. Color, corners, spacing and type all change together, on every window, for everyone on the board.',
  '',
  '- **censaiOS**: the brand, black and white with one accent',
  '- **Paper**: the same brand on a light page',
  '- **Studio**: soft corners, roomy',
  '- **Terminal**: sharp and dense',
].join('\n');
