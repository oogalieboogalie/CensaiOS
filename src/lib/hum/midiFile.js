// Standard MIDI File (type 1) writer for a Studio song: one track per
// synth track, drums on channel 10 so any music program plays them as
// drums. Positions are in beats, written at 480 ticks per beat.

const PPQ = 480;

const vlq = (n) => {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
};
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = s => [...new TextEncoder().encode(s)].slice(0, 120);

function chunk(type, body) {
  return [...text(type), ...u32(body.length), ...body];
}

function trackChunk(events, name) {
  const body = [0, 0xff, 0x03, ...vlq(text(name).length), ...text(name)];
  let last = 0;
  // Note-offs before note-ons at the same tick so a repeated note retriggers.
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', body);
}

/** Bytes of a .mid file for a Studio project. */
export function songToMidi(project) {
  const tempo = Math.round(60000000 / project.bpm);
  const head = [0, 0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x58, 0x04, project.beatsPerBar || 4, 2, 24, 8];
  const tracks = [chunk('MTrk', [...head, 0, 0xff, 0x2f, 0])];
  const melodic = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; // channel 10 (index 9) is for drums
  let next = 0;
  for (const t of project.tracks) {
    if (t.kind !== 'synth') continue;
    const drums = t.synth?.preset === 'drums';
    const ch = drums ? 9 : melodic[next++ % melodic.length];
    const events = [];
    for (const c of t.clips) {
      for (const n of c.notes || []) {
        if (n.t >= c.len) continue;
        const on = Math.round((c.start + n.t) * PPQ);
        const off = Math.max(on + 1, Math.round((c.start + Math.min(c.len, n.t + n.d)) * PPQ));
        const vel = Math.max(1, Math.min(127, Math.round(n.v * 127)));
        events.push({ tick: on, order: 1, data: [0x90 | ch, n.p & 127, vel] });
        events.push({ tick: off, order: 0, data: [0x80 | ch, n.p & 127, 0] });
      }
    }
    tracks.push(trackChunk(events, t.name));
  }
  const header = chunk('MThd', [0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255]);
  return new Uint8Array([...header, ...tracks.flat()]);
}
