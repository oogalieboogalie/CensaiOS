// Ready-made blueprints the Blueprints window offers to put on a board's
// shelf in one click. Each one is a recipe that already worked in censaiOS.
// Plain data only: the window saves it like any other blueprint, so it gets
// its own ID on the board and agents find it with "Do we have ...".

export const UI_TEAM_BLUEPRINT = Object.freeze({
  key: 'ui-team',
  title: 'UI Team Blueprint for Polished Windows',
  shelf: 3,
  type: 'UI and design review',
  purpose: 'Make every window look polished and dimensional',
  body: [
    '1. Pick the yardstick: products known for polish (Linear, Figma, Arc, Raycast, macOS, Notion, Vercel). Write down what they do with depth, type, spacing, corners and contrast, with the real numbers. In censaiOS it is docs/ui-yardstick.md.',
    '2. Open every window on an empty board with made-up data, in dark and in light, and take a picture of each. In censaiOS: npm run ui-team (docs/ui-team.md).',
    '3. Mark each picture out of 10 on eight parts: Depth (counts double), First look, Feel, Readable text (these three count 1.5), Type, Spacing, Works (count 1) and Corners (counts half). The overall mark out of 100 is the weighted average.',
    '4. Rank the windows worst first and publish a scorecard page with one picture of each.',
    '5. Fix what every window shares first, once, in the theme: window shadows, a lit top edge, layer colours, text that is too faint.',
    '6. Fix the worst window by hand with the shared depth pieces (src/styles/depth.css): a bar for toolbars, a well for lists and inputs, raised panels that lift on hover, buttons that sink when pressed, number tiles, and an empty state that says what to do next. Leave windows with a deliberate look alone.',
    '7. Take before and after pictures in dark and light and mark them again. Text must stand out from what it sits on (at least 4.5 to 1).',
    '8. Run the checks (npm run gate), get a second pair of eyes on the change, and land it through a green pull request.',
    '9. Report in one plain line: which window, where it is, the pictures, the limits, and "not yet proven on your PC".',
    '10. Repeat every night, one window at a time, until the worst mark is good enough.',
  ].join('\n'),
});

export const READY_BLUEPRINTS = Object.freeze([UI_TEAM_BLUEPRINT]);

/** The ready-made blueprints this board does not have yet, matched by name. */
export function missingReadyBlueprints(onShelf = [], ready = READY_BLUEPRINTS) {
  const names = new Set(onShelf.map((b) => String(b.title || '').trim().toLowerCase()));
  return ready.filter((b) => !names.has(b.title.toLowerCase()));
}

/** What the window sends to save one: the blueprint fields without the key. */
export function readyBlueprintDraft({ key, ...fields }) {
  return { ...fields };
}
