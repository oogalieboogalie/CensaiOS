// What a new Docs, Sheets or Slides window starts with when added from the
// Add palette: an empty paragraph on a Letter page, one empty sheet, one title slide.
import { makeBook } from './sheetBook.js';
import { makeSlide } from './slideModel.js';

export const OFFICE_STARTERS = Object.freeze({
  officeDocs: { title: 'Untitled document', docPage: 'letter', officeDoc: { order: ['b1'] }, 'ob.b1': { type: 'p', text: '', at: 1 } },
  officeSheets: { title: 'Untitled sheet', officeBook: makeBook() },
  officeSlides: { title: 'Untitled deck', officeDeck: { order: ['sl1'], theme: 'censai' }, 'os.sl1': { ...makeSlide('title'), at: 1 } },
});
