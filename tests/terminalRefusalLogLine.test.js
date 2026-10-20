import fs from 'node:fs';
import { refusalLogLine } from '../src/components/terminal/terminalSocket.js';

// Since the "Only the owner" message names both accounts, the terminal's app
// log line for a refusal must carry only the reason code, never that message.
describe('terminal refusal log line', () => {
  const refusal = {
    reason: 'owner-only',
    message: "Only the owner account (Pat Example) can open the terminal. You're signed in as sam.example@example.com.",
  };

  test('holds the reason and a fixed sentence, no name or email', () => {
    const line = refusalLogLine(refusal);
    expect(line).toEqual({ message: 'terminal refused: owner-only', detail: 'The refusal was shown in the terminal.' });
    expect(JSON.stringify(line)).not.toMatch(/Pat|Example|sam|@/);
  });

  test('a reason that is not a plain code is not copied either', () => {
    expect(refusalLogLine({ reason: 'Pat Example said no', message: 'x' }).message).toBe('terminal refused: unknown');
    expect(refusalLogLine(null).message).toBe('terminal refused: unknown');
  });

  test('the terminal sends that line, not the on-screen message', () => {
    const source = fs.readFileSync(new URL('../src/components/terminal/useTerminal.js', import.meta.url), 'utf8');
    const refused = source.slice(source.indexOf('onRefused('), source.indexOf('onMessage('));
    expect(refused).toMatch(/refusalLogLine\(refusal\)/);
    expect(refused).not.toMatch(/detail:\s*refusal\.message/);
  });
});
