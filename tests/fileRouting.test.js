import {
  fileLanguage,
  fileWindowKind,
  fileWindowProps,
  isCodeLikeFile,
  isDocLikeFile,
  isImageFile,
} from '../src/components/files/fileRouting.js';

describe('file browser window routing', () => {
  test.each([
    'app.js',
    'AppContent.jsx',
    'types.ts',
    'view.tsx',
    'package.json',
    'style.css',
    'index.html',
    'server.mjs',
    'config.cjs',
    'docker-compose.yml',
    'vite.config.js',
    'Dockerfile',
    '.env.example',
  ])('routes source/config file %s to the code editor', (name) => {
    expect(isCodeLikeFile(name)).toBe(true);
    expect(fileWindowKind(name)).toBe('code_editor');
  });

  test.each([
    'README.md',
    'notes.markdown',
    'brief.mdx',
    'handoff.txt',
    'guide.rst',
  ])('keeps document file %s on the doc path', (name) => {
    expect(isDocLikeFile(name)).toBe(true);
    expect(fileWindowKind(name)).toBe('doc');
  });

  test('builds code editor props without dropping GitHub context', () => {
    expect(fileWindowProps({ name: 'App.jsx', path: 'src/App.jsx' }, 'owner/repo')).toEqual({
      title: 'App.jsx',
      fileName: 'App.jsx',
      filePath: 'src/App.jsx',
      isGithub: true,
      githubRepo: 'owner/repo',
      language: 'jsx',
    });
  });

  test('normalizes common language labels', () => {
    expect(fileLanguage('docker-compose.yml')).toBe('yaml');
    expect(fileLanguage('index.htm')).toBe('html');
  });

  test.each([
    'photo.png',
    'screenshot.JPG',
    'diagram.svg',
    'animation.gif',
    'shot.webp',
    'icon.ico',
  ])('routes image file %s to the image viewer', (name) => {
    expect(isImageFile(name)).toBe(true);
    expect(fileWindowKind(name)).toBe('image');
  });

  test('does not route code or docs to the image viewer', () => {
    expect(isImageFile('app.js')).toBe(false);
    expect(isImageFile('README.md')).toBe(false);
    expect(isImageFile('Makefile')).toBe(false);
  });

  test('builds image viewer props without dropping GitHub context', () => {
    expect(fileWindowProps({ name: 'photo.png', path: 'assets/photo.png' }, 'owner/repo')).toEqual({
      title: 'photo.png',
      fileName: 'photo.png',
      filePath: 'assets/photo.png',
      isGithub: true,
      githubRepo: 'owner/repo',
    });
  });
});
