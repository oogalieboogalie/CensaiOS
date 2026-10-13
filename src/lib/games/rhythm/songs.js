// Built-in Rhythm Run songs: original tunes written for the board, played
// by the window's own synth, so there is nothing to download or license.
//
// Each bar is 16 steps (sixteenth notes). In a lead or bass line a note name
// starts a note, '-' holds it and '.' is silence. In a drum line k = kick,
// s = snare, h = hat, and '.' is silence.

const A1 = {
  lead: ['E5 - G5 - A5 - . G5 E5 - D5 - C5 - . .', 'E5 - G5 - A5 - C6 - B5 - A5 - G5 - . .', 'E5 - G5 - A5 - . G5 E5 - D5 - E5 - . .', 'D5 - C5 - D5 - E5 - G5 - - - - - . .'],
  bass: ['C3 - - . C3 - . . A2 - - . A2 - . .', 'F2 - - . F2 - . . G2 - - . G2 - . .', 'C3 - - . C3 - . . A2 - - . A2 - . .', 'F2 - - . G2 - . . C3 - - - - - . .'],
  drums: ['k . h . s . h . k . h . s . h .', 'k . h . s . h . k k h . s . h .', 'k . h . s . h . k . h . s . h .', 'k . h . s . h . k k h . s s s s'],
};
const B1 = {
  lead: ['A5 - - . G5 - E5 - G5 - - . E5 - D5 -', 'C5 - D5 - E5 - G5 - A5 - - - . . . .', 'A5 - - . G5 - E5 - G5 - - . A5 - C6 -', 'D6 - C6 - A5 - G5 - E5 - - - . . . .'],
  bass: ['A2 - . A2 . . A2 . F2 - . F2 . . F2 .', 'C3 - . C3 . . C3 . G2 - . G2 . . G2 .', 'A2 - . A2 . . A2 . F2 - . F2 . . F2 .', 'G2 - . G2 . . G2 . C3 - - - - - . .'],
  drums: ['k . h h s . h . k . h h s . h .', 'k . h h s . h . k . h h s . h h', 'k . h h s . h . k . h h s . h .', 'k . h h s . h . k s s . s s s s'],
};

const N_A = {
  lead: ['A4 - . A4 C5 - . E5 . . D5 - C5 - . .', 'A4 - . A4 C5 - . E5 . . G5 - E5 - . .', 'F5 - . E5 D5 - . C5 . . D5 - E5 - . .', 'E5 - - - C5 - - - B4 - - - . . . .'],
  bass: ['A2 . A2 . A2 . A2 . A2 . A2 . A2 . A2 .', 'A2 . A2 . A2 . A2 . G2 . G2 . G2 . G2 .', 'F2 . F2 . F2 . F2 . F2 . F2 . F2 . F2 .', 'E2 . E2 . E2 . E2 . E2 . E2 . G#2 . G#2 .'],
  drums: ['k . h . s . h . k . h . s . h .', 'k . h . s . h . k . h . s . h k', 'k . h . s . h . k . h . s . h .', 'k . h . s . h . k . s . s s s s'],
};
const N_B = {
  lead: ['C6 - B5 - A5 - E5 - . . A5 - B5 - C6 -', 'D6 - C6 - B5 - G5 - . . . . . . . .', 'C6 - B5 - A5 - E5 - . . A5 - B5 - C6 -', 'B5 - G#5 - E5 - B4 - E5 - - - . . . .'],
  bass: ['A2 . A3 . A2 . A3 . F2 . F3 . F2 . F3 .', 'G2 . G3 . G2 . G3 . C3 . C4 . C3 . C4 .', 'A2 . A3 . A2 . A3 . F2 . F3 . F2 . F3 .', 'E2 . E3 . E2 . E3 . E2 . E3 . G#2 . B2 .'],
  drums: ['k . h k s . h . k . h k s . h .', 'k . h k s . h . k . h k s . h h', 'k . h k s . h . k . h k s . h .', 'k k s . k k s . k s s s s s s s'],
};

const O_A = {
  lead: ['D5 D5 . F5 . D5 G5 . F5 . D5 . C5 . D5 .', 'D5 D5 . F5 . D5 A5 . G5 . F5 . D5 . . .', 'D5 D5 . F5 . D5 G5 . F5 . D5 . C5 . A4 .', 'C5 . D5 . F5 . G5 . A5 . C6 . A5 . . .'],
  bass: ['D2 . D2 D3 . D2 D2 . D2 . D2 D3 . D2 C3 .', 'D2 . D2 D3 . D2 D2 . A#1 . A#1 A#2 . A#1 C2 .', 'D2 . D2 D3 . D2 D2 . D2 . D2 D3 . D2 C3 .', 'A#1 . A#1 . C2 . C2 . D2 . D2 . D3 . . .'],
  drums: ['k h k h s h k h k h k h s h k h', 'k h k h s h k h k h k h s h s h', 'k h k h s h k h k h k h s h k h', 'k h k h s h k h k s k s s s s s'],
};
const O_B = {
  lead: ['A5 . G5 . F5 . G5 . A5 . . D6 . C6 A5 .', 'G5 . F5 . D5 . F5 . G5 . . . . . . .', 'A5 . G5 . F5 . G5 . A5 . . D6 . F6 E6 .', 'D6 . C6 . A5 . G5 . F5 . G5 . A5 . D6 .'],
  bass: ['A#1 . A#2 . A#1 . A#2 . C2 . C3 . C2 . C3 .', 'D2 . D3 . D2 . D3 . A1 . A2 . A1 . A2 .', 'A#1 . A#2 . A#1 . A#2 . C2 . C3 . C2 . C3 .', 'D2 . D3 . C2 . C3 . A#1 . A#2 . A1 . A2 .'],
  drums: ['k h s h k h s h k h s h k h s h', 'k h s h k h s h k h s h k k s h', 'k h s h k h s h k h s h k h s h', 'k s k s k s k s s s s s s s s s'],
};

const intro = (bars, drums) => ({ lead: Array(bars).fill(''), bass: Array(bars).fill(''), drums: Array(bars).fill(drums) });

export const SONGS = [
  {
    id: 'first-light', title: 'First Light', mood: 'Bright and easy', bpm: 104,
    sections: [intro(1, 'k . h . s . h . k . h . s . h .'), A1, A1, B1, A1],
    tone: { lead: 'triangle', bass: 'triangle' },
  },
  {
    id: 'night-drive', title: 'Night Drive', mood: 'Synthwave, steady', bpm: 116,
    sections: [intro(1, 'k . h . s . h . k . h . s . h h'), N_A, N_B, N_A, N_B],
    tone: { lead: 'sawtooth', bass: 'square' },
  },
  {
    id: 'overclock', title: 'Overclock', mood: 'Fast and busy', bpm: 138,
    sections: [intro(2, 'k h k h s h k h k h k h s h k h'), O_A, O_A, O_B, O_A, O_B],
    tone: { lead: 'square', bass: 'sawtooth' },
  },
];

export function songById(id) {
  return SONGS.find((s) => s.id === id) || null;
}
