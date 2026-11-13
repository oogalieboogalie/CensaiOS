/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { getDefaultWindowSize, WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { wakeUpWindows } from '../src/lib/wakeUp/boardWakeUp.js';
import { layoutTemplateBoard } from '../src/lib/templates/boardTemplates.js';
import { EmptyState } from '../src/components/canvas/CanvasEmptyState.jsx';
import { LAUNCHPAD_STARTS } from '../src/lib/launchpadStarts.js';
import { PROPS_BY_KIND } from '../src/lib/modules/addPaletteItems.js';

const sizeOf = (spawnArgs) => spawnArgs[3];

describe('one default window size, wherever a window comes from', () => {
  test('the welcome board opens its chat and Try this list at their usual sizes, side by side with the sample hunt', () => {
    const [chat, hunt, tryThis] = wakeUpWindows({ name: 'Jordan', now: 0 });
    expect(sizeOf(chat)).toEqual(getDefaultWindowSize('chat'));
    expect(sizeOf(tryThis)).toEqual(getDefaultWindowSize('tryThis'));
    const [chatAt, huntAt, listAt] = [chat[2], hunt[2], tryThis[2]];
    // Nothing overlaps: the list sits under the chat, both left of the hunt.
    expect(listAt.y).toBeGreaterThanOrEqual(chatAt.y + sizeOf(chat).h);
    expect(chatAt.x + sizeOf(chat).w).toBeLessThanOrEqual(huntAt.x);
    expect(listAt.x + sizeOf(tryThis).w).toBeLessThanOrEqual(huntAt.x);
  });

  test('a board template window outside any group opens at its usual size, not 480x420', () => {
    const { windows } = layoutTemplateBoard({ groups: [], windows: [{ id: 'w1', kind: 'chat', title: 'Team chat' }, { id: 'w2', kind: 'todos', title: 'Launch week' }] });
    for (const win of windows) {
      expect({ w: win.w, h: win.h }).toEqual(getDefaultWindowSize(win.kind));
    }
  });

  test('no starting button or launcher block carries its own size', () => {
    expect(WINDOW_MANIFESTS.filter((m) => m.launcher?.sizeOverride).map((m) => m.kind)).toEqual([]);
  });

  test('the empty board\'s starting buttons open a window the same way the Add menu does', () => {
    const onSpawn = jest.fn();
    render(<EmptyState onSpawn={onSpawn} />);
    // "Browse modules" opens Add itself rather than a window.
    const opens = LAUNCHPAD_STARTS.filter((start) => start.kind !== 'marketplace');
    expect(opens.length).toBeGreaterThan(0);
    for (const start of opens) {
      fireEvent.click(screen.getByText(start.label));
      // The kind and Add's own props for it, and no size of its own.
      expect(onSpawn).toHaveBeenLastCalledWith(start.kind, PROPS_BY_KIND[start.kind] || {});
    }
  });
});
