import {
  buildDesignDocument,
  classifyPastedDesign,
  prepareReactSource,
  suggestDesignSize,
} from '../src/lib/design/designSource.js';

describe('classifyPastedDesign', () => {
  test('recognises the kinds of UI people paste', () => {
    expect(classifyPastedDesign('https://www.figma.com/design/AbC123/Landing?node-id=1-2')).toEqual({
      kind: 'figma', url: 'https://www.figma.com/design/AbC123/Landing?node-id=1-2',
    });
    expect(classifyPastedDesign('<svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>')).toEqual({ kind: 'design', sourceType: 'svg' });
    expect(classifyPastedDesign('<!doctype html><html><body><h1>Hi</h1></body></html>')).toEqual({ kind: 'design', sourceType: 'html' });
    expect(classifyPastedDesign('<div class="flex gap-4 p-6 bg-slate-900"><button class="rounded-xl">Go</button></div>'))
      .toEqual({ kind: 'design', sourceType: 'tailwind' });
    expect(classifyPastedDesign('<style>.a{color:red}</style><div class="flex">x</div>')).toEqual({ kind: 'design', sourceType: 'html' });
    expect(classifyPastedDesign("import React from 'react';\nexport default function Card() {\n  return (<div>Hi</div>);\n}"))
      .toEqual({ kind: 'design', sourceType: 'react' });
  });

  test('leaves plain code and prose alone', () => {
    expect(classifyPastedDesign('def main():\n    print("hi")')).toBeNull();
    expect(classifyPastedDesign('const x = { a: 1 };')).toBeNull();
    expect(classifyPastedDesign('Remember to buy milk')).toBeNull();
    expect(classifyPastedDesign('https://example.com/design/abc')).toBeNull();
    expect(classifyPastedDesign('a < b and c > d')).toBeNull();
  });
});

describe('prepareReactSource', () => {
  test('strips imports and mounts the default export', () => {
    const { code, componentName } = prepareReactSource(
      "import React, { useState } from 'react';\nimport 'tailwindcss/base.css';\nexport default function Pricing() {\n  const [n] = useState(1);\n  return <p>{n}</p>;\n}",
    );
    expect(componentName).toBe('Pricing');
    expect(code).not.toMatch(/^\s*import/m);
    expect(code).toContain('const { useState, useEffect');
    expect(code).toContain('function Pricing()');
    expect(code.trim().endsWith("ReactDOM.createRoot(document.getElementById('root')).render(<Pricing />);")).toBe(true);
  });

  test('mounts the last component when nothing is exported, and respects an existing mount', () => {
    expect(prepareReactSource('const Badge = () => <b>x</b>;\nconst App = () => <Badge/>;').componentName).toBe('App');
    const own = prepareReactSource("function App(){return <i/>}\nReactDOM.createRoot(document.getElementById('root')).render(<App/>);");
    expect(own.code.match(/createRoot/g)).toHaveLength(1);
  });
});

describe('buildDesignDocument', () => {
  test('wraps fragments with a transparent, margin-free body', () => {
    const doc = buildDesignDocument('html', '<h1>Hello</h1>');
    expect(doc).toContain('<h1>Hello</h1>');
    expect(doc).toContain('html, body { margin: 0; background: transparent; }');
  });

  test('tailwind and react get their runtimes; full documents pass through', () => {
    expect(buildDesignDocument('tailwind', '<div class="p-4">x</div>')).toContain('cdn.tailwindcss.com');
    const react = buildDesignDocument('react', 'export default function A(){ return <div/> }');
    expect(react).toContain('@babel/standalone');
    expect(react).toContain('<script type="text/babel" data-presets="react">');
    const full = '<!doctype html><html><head></head><body>x</body></html>';
    expect(buildDesignDocument('html', full)).toBe(full);
    expect(buildDesignDocument('html', '   ')).toBe('');
  });

  test('svg sizes from its viewBox', () => {
    expect(buildDesignDocument('svg', '<svg viewBox="0 0 10 10"></svg>')).toContain('body > svg { width: 100%; height: 100%; }');
    expect(suggestDesignSize('svg', '<svg viewBox="0 0 1800 900"></svg>')).toEqual({ w: 900, h: 450 });
    expect(suggestDesignSize('html', '<p/>')).toEqual({ w: 960, h: 640 });
  });
});
