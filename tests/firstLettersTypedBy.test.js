import * as Y from 'yjs';
import { writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { noteSignedInName } from '../src/lib/collaboration/signedInName.js';
import { sharedText } from '../src/lib/collaboration/textCarets.js';
import { writerRuns } from '../shared/collab/typedBy.js';

// The very first letters typed into an empty box of an open window (say the
// Model Arena request, which a new window opens without) carry the typist's
// name, so "Who typed what" never shows them as "Not recorded". Words a
// window opens with (from a file, or a picked sample) carry no name. All
// people and words are made up.
const PAT = { id: 'pat-1', name: 'Pat Example' };
const arena = (extra = {}) => ({ id: 'ma1', kind: 'modelArena', x: 0, y: 0, w: 700, h: 500, ...extra });
const board = (extra) => ({ wins: [arena(extra)] });
const runsOf = (doc, field) => writerRuns(sharedText(doc, 'ma1', field).toDelta());

afterEach(() => noteSignedInName(null));

test('the first letter typed into a box the window opened without carries the name', () => {
  const doc = new Y.Doc();
  writeStateToDoc(doc, null, board(), 'local');
  noteSignedInName(PAT.name, PAT.id);
  writeStateToDoc(doc, board(), board({ prompt: 'N' }), 'local');
  writeStateToDoc(doc, board({ prompt: 'N' }), board({ prompt: 'Name a town.' }), 'local');
  expect(runsOf(doc, 'prompt')).toEqual([{ text: 'Name a town.', by: 'Pat Example', byId: 'pat-1' }]);
});

test('the first letter typed into an empty box carries the name too', () => {
  const doc = new Y.Doc();
  noteSignedInName(PAT.name, PAT.id);
  writeStateToDoc(doc, null, board({ system: '' }), 'local');
  writeStateToDoc(doc, board({ system: '' }), board({ system: 'K' }), 'local');
  expect(runsOf(doc, 'system')).toEqual([{ text: 'K', by: 'Pat Example', byId: 'pat-1' }]);
});

test('words a window opens with carry no name', () => {
  const doc = new Y.Doc();
  noteSignedInName(PAT.name, PAT.id);
  writeStateToDoc(doc, null, board({ prompt: 'From a file.' }), 'local');
  expect(runsOf(doc, 'prompt')).toEqual([{ text: 'From a file.', by: null, byId: null }]);
});
