import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../server/appLog/access.js', () => ({ canReadAppLog: jest.fn(async () => true) }));

const { scrubBrowserLine } = await import('../server/appLog/scrubBrowserLine.js');
const { onLogRecord } = await import('../server/logger.js');
const { appLogRouter } = await import('../server/routes/appLog.js');

// A made-up warning in the shape React prints when a typed link is blocked.
const SCHEME = ['java', 'script'].join('');
const TYPED = `${SCHEME}:alert('Pat typed this')`;
const WARNING = `Warning: A future version of React will block ${SCHEME}: URLs as a security precaution. Use event handlers instead. React was passed ${JSON.stringify(TYPED)}.`;

describe('scrubBrowserLine', () => {
  test('a warning quoting a typed link keeps its fixed words only', () => {
    const out = scrubBrowserLine(WARNING);
    expect(out).toMatch(new RegExp(`^Warning: A future version of React will block ${SCHEME}: URLs`));
    expect(out).toContain('React was passed <value>.');
    expect(out).not.toMatch(/Pat typed|alert/);
  });

  test('links of every kind go, code locations keep their path', () => {
    expect(scrubBrowserLine('open https://sam.example.com/private?q=1 failed')).toBe('open <link> failed');
    expect(scrubBrowserLine(`bad ${SCHEME}:void(0) here`)).toBe('bad <link> here');
    expect(scrubBrowserLine('img data:image/png;base64,AAAA broke')).toBe('img <link> broke');
    expect(scrubBrowserLine('at render (http://localhost:3002/src/components/Todo.jsx?t=12:40:7)'))
      .toBe('at render (/src/components/Todo.jsx:40:7)');
  });

  test('quotes of every kind go; apostrophes in words stay', () => {
    expect(scrubBrowserLine("Can't find 'Pat notes' or \"Sam\" or `Testco` or “Mo”")).toBe(
      "Can't find <value> or <value> or <value> or <value>",
    );
    expect(scrubBrowserLine('Cannot read properties of undefined (reading x)')).toBe('Cannot read properties of undefined (reading x)');
  });
});

describe('POST /api/logs/browser', () => {
  test('the written line carries no quoted value and no link', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.session = { userId: 4 }; next(); });
    app.use('/api/logs', appLogRouter);
    const seen = [];
    const stop = onLogRecord((record) => { if (record.namespace.startsWith('browser')) seen.push(record); });
    await request(app).post('/api/logs/browser').send({
      entries: [{ level: 'error', message: WARNING, detail: `at a (http://localhost:3002/src/a.jsx:3:9)\nlink ${TYPED}` }],
    }).expect(202);
    stop();
    const written = JSON.stringify(seen);
    expect(written).not.toMatch(/Pat typed|alert/);
    expect(seen[0].meta.detail).toContain('/src/a.jsx:3:9');
  });
});
