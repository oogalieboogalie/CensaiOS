// Agent Company: the idle clicker's rules, and two people playing at once
// through the board's Yjs doc without losing each other's taps or hires.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  HIRES, buyUpgrade, cleanSeat, companyAt, contributors, earnedBetween, emptySeat, formatAmount, hire, hireCost,
  readSeats, seatField, seatKey, shopHires, shopUpgrades, tap,
} from '../src/lib/games/idle/economy.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const seatsOf = (...pairs) => Object.fromEntries(pairs);

describe('the economy', () => {
  test('taps earn credits and fill the wallet', () => {
    let seat = emptySeat('Alex', 0);
    seat = tap(seat, companyAt({}, 0), 20);
    const company = companyAt(seatsOf([seatField('Alex'), seat]), 0);
    expect(company.wallet).toBe(20);
    expect(company.tap).toBe(1);
  });

  test('hires cost money, grow 15% each, and keep producing over time', () => {
    let seat = tap(emptySeat('Alex', 0), companyAt({}, 0), 40);
    const seats = () => seatsOf([seatField('Alex'), seat]);
    seat = hire(seat, companyAt(seats(), 100), 'intern', 100);
    expect(seat.spent).toBe(15);
    expect(hireCost('intern', 1)).toBe(Math.ceil(15 * 1.15));
    seat = hire(seat, companyAt(seats(), 100), 'intern', 100);
    expect(companyAt(seats(), 100).wallet).toBeCloseTo(40 - 15 - 18);
    // Two interns at 0.1/s for 100 seconds.
    expect(companyAt(seats(), 200).wallet).toBeCloseTo(7 + 20);
    expect(companyAt(seats(), 200).rate).toBeCloseTo(0.2);
  });

  test('you cannot buy what the company cannot afford', () => {
    const seat = tap(emptySeat('Alex', 0), companyAt({}, 0), 10);
    const company = companyAt(seatsOf(['seat_alex', seat]), 0);
    expect(hire(seat, company, 'intern', 0)).toBeNull();
    expect(buyUpgrade(seat, company, 'keyboard')).toBeNull();
  });

  test('upgrades double taps or add a share of output, and can be bought once', () => {
    let seat = tap(emptySeat('Alex', 0), companyAt({}, 0), 200);
    seat = buyUpgrade(seat, companyAt({ s: seat }, 0), 'keyboard');
    let company = companyAt({ s: seat }, 0);
    expect(company.tap).toBe(2);
    expect(buyUpgrade(seat, company, 'keyboard')).toBeNull();
    seat = { ...seat, upgrades: [...seat.upgrades, 'autocomplete'], hires: { agent: { n: 10, sumAt: 0 } } };
    company = companyAt({ s: seat }, 0);
    expect(company.tap).toBeCloseTo(2 + 0.01 * 10);
  });

  test('the shop shows the next hire up and unlocked upgrades only', () => {
    expect(shopHires(companyAt({}, 0)).map((h) => h.id)).toEqual(['intern', 'agent']);
    const seat = { ...emptySeat('A', 0), hires: { agent: { n: 5, sumAt: 0 } } };
    const company = companyAt({ s: seat }, 0);
    expect(shopHires(company).map((h) => h.id)).toEqual(['intern', 'agent', 'squad']);
    const ids = shopUpgrades(company).map((u) => u.id);
    expect(ids).toContain('pairing');
    expect(ids).not.toContain('telemetry');
  });

  test('"while you were away" counts what the hires made in between', () => {
    const seat = { ...emptySeat('A', 0), hires: { agent: { n: 3, sumAt: 0 } } };
    expect(earnedBetween({ s: seat }, 1000, 1600)).toBeCloseTo(1800);
    expect(earnedBetween({ s: seat }, 1600, 1000)).toBe(0);
  });

  test('a clock that runs behind never counts negative work', () => {
    const seat = { ...emptySeat('A', 0), hires: { agent: { n: 1, sumAt: 500 } } };
    expect(companyAt({ s: seat }, 400).earned).toBe(0);
  });

  test('bad seat data is cleaned rather than trusted', () => {
    const seat = cleanSeat({ name: 'X'.repeat(80), taps: -5, tapEarned: 'lots', hires: { intern: { n: 2.7, sumAt: 10 }, hacked: { n: 9 } }, upgrades: ['keyboard', 'free-money'] });
    expect(seat.name).toHaveLength(40);
    expect(seat.taps).toBe(0);
    expect(seat.tapEarned).toBe(0);
    expect(seat.hires).toEqual({ intern: { n: 2, sumAt: 10 } });
    expect(seat.upgrades).toEqual(['keyboard']);
    expect(readSeats({ id: 'w', seat_a: seat, seat_b: 'junk', other: 1 })).toEqual({ seat_a: seat });
  });

  test('names become field-safe seat keys', () => {
    expect(seatKey('Alex Green')).toBe('alex-green');
    expect(seatKey('')).toBe('player');
    expect(seatField('Sam')).toBe('seat_sam');
  });

  test('big numbers read like money', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(2.5)).toBe('2.5');
    expect(formatAmount(12345)).toBe('12,345');
    expect(formatAmount(1.5e6)).toBe('1.50M');
    expect(formatAmount(2.34e10)).toBe('23.4B');
  });

  test('contributors rank by what each person put in', () => {
    const rows = contributors({ seat_a: { ...emptySeat('A', 0), tapEarned: 5 }, seat_b: { ...emptySeat('B', 0), spent: 50, hires: { intern: { n: 2, sumAt: 0 } } } });
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
    expect(rows[0].hires).toBe(2);
  });
});

describe('two people grow one company', () => {
  test('simultaneous taps and hires from two browsers both survive the merge', () => {
    const frame = { id: 'w1', kind: 'agentCompany', x: 0, y: 0, w: 760, h: 520 };
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [frame] };
    writeStateToDoc(a, null, base, 'local');
    sync();

    const alex = tap(emptySeat('Alex', 0), companyAt({}, 0), 30);
    const samTapped = tap(emptySeat('Sam', 0), companyAt({}, 0), 100);
    const sam = hire(samTapped, companyAt({ s: samTapped }, 10), 'agent', 10);
    writeStateToDoc(a, base, { wins: [{ ...frame, [seatField('Alex')]: alex }] }, 'local');
    writeStateToDoc(b, base, { wins: [{ ...frame, [seatField('Sam')]: sam }] }, 'local');
    sync();

    for (const doc of [a, b]) {
      const seats = readSeats(readDocState(doc).wins[0]);
      expect(Object.keys(seats).sort()).toEqual(['seat_alex', 'seat_sam']);
      const company = companyAt(seats, 20);
      expect(company.owned.agent).toBe(1);
      // 30 + 100 tapped, 100 spent, one agent for 10 seconds.
      expect(company.wallet).toBeCloseTo(40);
    }
  });
});

describe('Agent Company in the Add palette', () => {
  test('it is a registered game window with a cover', () => {
    const manifest = WINDOW_MANIFESTS.find((m) => m.kind === 'agentCompany');
    expect(manifest?.componentName).toBe('AgentCompanyWindow');
    const games = buildAddSections({ manifests: WINDOW_MANIFESTS.filter((m) => m.moduleMenu?.show !== false) }).find((s) => s.label === 'Games');
    expect(games.items.map((i) => i.label)).toContain('Agent Company');
  });

  test('each hire costs more than the one before', () => {
    for (let i = 1; i < HIRES.length; i += 1) expect(HIRES[i].base).toBeGreaterThan(HIRES[i - 1].base);
  });
});
