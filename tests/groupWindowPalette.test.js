import { describe, expect, test } from '@jest/globals';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { MODULE_MENU_MANIFESTS } from '../src/lib/windowManifest.js';

describe('Group window in the Add menu', () => {
  test('is listed under Chat and agents', () => {
    const section = buildAddSections({ manifests: MODULE_MENU_MANIFESTS }).find((s) => s.label === 'Chat and agents');
    const group = section.items.find((i) => i.label === 'Group');
    expect(group).toBeTruthy();
    expect(group.hint).toMatch(/milestones/);
  });

  test('agents are still added from the designer, not the palette', () => {
    const labels = buildAddSections({ manifests: MODULE_MENU_MANIFESTS }).flatMap((s) => s.items.map((i) => i.label));
    expect(labels).not.toContain('Agent');
  });
});
