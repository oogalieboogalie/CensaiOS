/**
 * @jest-environment jsdom
 */
// A group near the top of the screen shows its name inside its top edge, so
// the top toolbars never sit over the name and its Layouts button.
import { labelPlace, labelWouldHide, TOP_BAR_ROOM } from '../src/components/canvas/groupLabelPlace.js';

test('a label above a group close to the top would hide under the toolbars', () => {
  expect(labelWouldHide(10)).toBe(true);
  expect(labelWouldHide(TOP_BAR_ROOM + 33)).toBe(true);
  expect(labelWouldHide(TOP_BAR_ROOM + 34)).toBe(false);
  expect(labelWouldHide(400)).toBe(false);
});

test('the label sits above the group, or inside its top edge, at screen size', () => {
  expect(labelPlace(false, 2)).toEqual({ bottom: '100%', transform: 'translateY(-6px) scale(0.5)', transformOrigin: 'bottom left' });
  expect(labelPlace(true, 2)).toEqual({ top: 0, bottom: 'auto', transform: 'translateY(6px) scale(0.5)', transformOrigin: 'top left' });
});
