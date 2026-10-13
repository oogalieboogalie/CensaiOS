import {
  buildMetaSource,
  buildWindowFilePlan,
  deriveComponentName,
  deriveCssFilename,
  normalizeWindowKind,
  parseLlmJsonResponse,
  rewriteCssImport,
} from '../server/window-import/windowPackageWriter.js';
import { validateGeneratedWindow } from '../server/window-import/validation.js';

describe('generated window validation trust boundary', () => {
  test.each([
    ['document-cookie', 'const token = document.cookie;'],
    ['local-storage', "localStorage.getItem('secret');"],
    ['session-storage', "sessionStorage.setItem('x', 'y');"],
    ['import-meta-env', 'const key = import.meta.env.VITE_SECRET;'],
    ['fetch-http', "fetch('https://example.com/collect');"],
    ['fetch-http', 'fetch("http://example.com/collect");'],
    ['websocket', "new WebSocket('wss://example.com/socket');"],
    ['websocket', 'new WebSocket("ws://example.com/socket");'],
    ['dangerous-html', '<div dangerouslySetInnerHTML={{ __html: html }} />'],
    ['iframe-srcdoc', '<iframe srcDoc={html} />'],
    ['script-element', "document.createElement('script');"],
    ['inner-html', 'node.innerHTML = html;'],
    ['outer-html', 'node.outerHTML = html;'],
    ['window-location', "window.location = 'https://example.com';"],
    ['location-href', "location.href = 'https://example.com';"],
    ['clipboard-write', "navigator.clipboard.writeText(secret);"],
  ])('blocks browser-side trust boundary pattern %s', (code, rawJsx) => {
    const result = validateGeneratedWindow({
      kind: 'unsafe',
      label: 'Unsafe',
      rawJsx,
      rawCss: '',
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
  });

  test('allows same-origin API fetch and ordinary React/CSS code', () => {
    const result = validateGeneratedWindow({
      kind: 'safe',
      label: 'Safe',
      rawJsx: `
        export function SafeWindow() {
          const [items, setItems] = React.useState([]);
          React.useEffect(() => { fetch('/api/projects').then(setItems); }, []);
          return <div className="safe">{items.length}</div>;
        }
      `,
      rawCss: '.safe { color: var(--ink); background: var(--surface); }',
    });

    expect(result).toMatchObject({ ok: true, issues: [] });
  });
});

describe('window package writer helpers', () => {
  test('parses fenced LLM JSON responses', () => {
    const parsed = parseLlmJsonResponse('```json\n{"kind":"demo","jsx":"x"}\n```');
    expect(parsed).toEqual({ kind: 'demo', jsx: 'x' });
  });

  test('normalizes kind, component name, and css filename', () => {
    expect(normalizeWindowKind('Demo Window!')).toBe('demoWindow');
    expect(deriveComponentName('demoWindow')).toBe('DemoWindowWindow');
    expect(deriveCssFilename('DemoWindowWindow')).toBe('DemoWindowWindow.css');
  });

  test('rewrites existing css import to the derived package css file', () => {
    expect(rewriteCssImport({
      jsx: "import './style.css';\nexport function DemoWindow() {}",
      componentName: 'DemoWindow',
    })).toContain("import './DemoWindow.css'");
  });

  test('builds meta source and file plan without writing files', () => {
    const meta = buildMetaSource({
      kind: 'demoWindow',
      label: 'Demo Window',
      componentName: 'DemoWindow',
      size: { w: 400, h: 300 },
      launcher: { show: true, order: 10 },
    });
    expect(meta).toContain('export const windowMeta');
    expect(meta).toContain('"demoWindow"');
    expect(meta).toContain('launcher');
    expect(meta).toContain("moduleMenu: { show: false, status: 'prototype' }");

    const plan = buildWindowFilePlan({
      kind: 'Demo Window!',
      label: 'Demo Window',
      size: { w: 400, h: 300 },
      jsx: "import './old.css';\nexport function DemoWindow() {}",
      css: '.demo { color: var(--ink); }',
      launcher: null,
    });

    expect(plan.kind).toBe('demoWindow');
    expect(plan.componentName).toBe('DemoWindowWindow');
    expect(plan.jsx).toContain("import './DemoWindowWindow.css'");
    expect(plan.files.map(file => file.path.endsWith('index.jsx'))).toContain(true);
    expect(plan.files.map(file => file.path.endsWith('meta.js'))).toContain(true);
    expect(plan.files.map(file => file.path.endsWith('DemoWindowWindow.css'))).toContain(true);
  });
});
