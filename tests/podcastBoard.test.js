/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { useWorkspaceStore } from '../src/lib/store.js';
import { loadGroupHotkeys, saveGroupHotkeys } from '../src/lib/groupHotkeys.js';
import { buildPodcastBoard, podcastSceneSpecs, rowOrigin, PODCAST_BOARD_EVENT, PODCAST_BRIEF } from '../src/lib/present/podcastBoard.js';
import { resolveRun } from '../src/lib/presentScenes.js';

// "Build the podcast board": six scenes in one click, nothing already on the
// board touched, F1..F5 bound to the new groups and F6 on the whole row.
describe('podcast board builder', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({
      wins: [{ id: 'mine', kind: 'doc', x: 0, y: 50, w: 600, h: 400 }],
      canvasGroups: [],
    });
  });

  test('the new row starts to the right of everything already there', () => {
    expect(rowOrigin([{ x: 0, y: 50, w: 600, h: 400 }, { x: 900, y: -30, w: 100, h: 10 }])).toEqual({ x: 1400, y: -30 });
    expect(rowOrigin([])).toEqual({ x: 0, y: 0 });
  });

  test('builds five groups, binds F1..F5, names every scene and points F6 at the row', () => {
    saveGroupHotkeys('ws-1', { 9: 'kept' });
    const setScenes = jest.fn();
    const heard = jest.fn();
    window.addEventListener(PODCAST_BOARD_EVENT, heard);
    const ids = buildPodcastBoard({ workspaceId: 'ws-1', setScenes });
    window.removeEventListener(PODCAST_BOARD_EVENT, heard);

    const { wins, canvasGroups } = useWorkspaceStore.getState();
    expect(ids).toHaveLength(5);
    expect(canvasGroups.map((g) => g.label)).toEqual(['Change the look', 'LeadHound finds leads', 'Two people, one board', 'Agents hand off', 'Design to code']);
    expect(wins.find((w) => w.id === 'mine')).toMatchObject({ x: 0, y: 50 });
    expect(wins.find((w) => w.id === 'mine').groupId).toBeFalsy();
    const windowCount = podcastSceneSpecs().reduce((n, s) => n + s.windows.length, 0);
    expect(wins).toHaveLength(1 + windowCount);
    expect(wins.filter((w) => w.id !== 'mine').every((w) => ids.includes(w.groupId))).toBe(true);

    const bindings = loadGroupHotkeys('ws-1');
    expect(bindings).toMatchObject({ 1: ids[0], 2: ids[1], 3: ids[2], 4: ids[3], 5: ids[4], 9: 'kept' });
    const scenes = setScenes.mock.calls[0][0];
    expect(scenes.map((s) => s.name)).toEqual(['Change the look', 'LeadHound finds leads', 'Two people, one board', 'Agents hand off', 'Design to code', 'Come try it']);
    expect(scenes[5].area).toEqual(expect.objectContaining({ w: expect.any(Number), h: expect.any(Number) }));
    expect(resolveRun(scenes, bindings, canvasGroups)).toHaveLength(6);
    expect(heard).toHaveBeenCalledTimes(1);

    const live = wins.find((w) => w.title === 'LeadHound');
    expect(live.leadHound.brief).toEqual(PODCAST_BRIEF);
    expect(wins.find((w) => w.title === 'LeadHound · for agents').leadHound.result.sample).toBe(true);
  });
});
