// Plain words for receipts, help statuses while a receipt is signed or a
// call waits at the relay, and the "Another censaiOS" copy line.
import {
  formatDuration, formatPrice, formatTokens, receiptLine, shortHash, shortInstall,
} from '../src/lib/agentNetwork/receiptText.js';
import { deriveHelpStatus } from '../server/agent-registry/helpRequestStore.js';
import { setupSnippets } from '../src/lib/agentEndpoints/snippets.js';

test('receipt numbers read like a person wrote them', () => {
  expect(formatTokens(1755)).toBe('1,755 tokens');
  expect(formatTokens(1)).toBe('1 token');
  expect(formatDuration(213)).toBe('213 ms');
  expect(formatDuration(4200)).toBe('4.2 s');
  expect(formatDuration(null)).toBeNull();
  expect(formatPrice(null)).toBe('no price');
  expect(formatPrice({ cents: 25, currency: 'USD' })).toBe('$0.25');
  expect(formatPrice({ cents: 150, currency: 'EUR' })).toBe('1.50 EUR');
  expect(shortInstall('ci_2b9bcce25db1c1a613fdb231')).toBe('ci_2b9b…b231');
  expect(shortHash('c84d8131a4ffff')).toBe('c84d8131a4…');
  expect(receiptLine({ verified: true, tokens: 1755, durationMs: 135, counterVerified: true }))
    .toBe('Signed receipt · 1,755 tokens · 135 ms · both sides signed');
  expect(receiptLine({ verified: false, tokens: 0 })).toMatch(/does not check out/);
  expect(receiptLine(null)).toBe('');
});

test('help status: waiting at the relay, and finishing until the receipt is signed', () => {
  const base = { status: 'dispatched' };
  expect(deriveHelpStatus({ ...base, run_status: 'pending', run_relay: { callId: 'rc_1' } })).toBe('waiting');
  expect(deriveHelpStatus({ ...base, run_status: 'pending' })).toBe('queued');
  expect(deriveHelpStatus({ ...base, run_status: 'succeeded', run_completed_at: new Date() })).toBe('working');
  expect(deriveHelpStatus({ ...base, run_status: 'succeeded', run_completed_at: new Date(), receipt_row: {} })).toBe('completed');
  expect(deriveHelpStatus({ ...base, run_status: 'succeeded', run_completed_at: new Date(Date.now() - 60_000) })).toBe('completed');
  expect(deriveHelpStatus({ ...base, run_status: 'failed', run_completed_at: new Date(Date.now() - 60_000) })).toBe('failed');
});

test('the Share panel hands another censaiOS the relay address when there is one', () => {
  const endpoint = { agentName: 'Atlas', mcpPath: '/api/mcp/agents/abc', askPath: '/api/mcp/agents/abc/ask' };
  const direct = setupSnippets({ base: 'http://localhost:5173', endpoint, key: 'cak_x' }).find((s) => s.id === 'censaios');
  expect(direct.text).toBe('Address: http://localhost:5173/api/mcp/agents/abc\nKey: cak_x');
  const relayed = setupSnippets({ base: 'http://localhost:5173', endpoint, key: 'cak_x', relayAddress: 'https://relay/i/ci_1/api/mcp/agents/abc' })
    .find((s) => s.id === 'censaios');
  expect(relayed.text).toMatch(/^Address: https:\/\/relay\/i\/ci_1/);
});
