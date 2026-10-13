const DOC_EXTENSIONS = new Set([
  'md',
  'markdown',
  'mdx',
  'txt',
  'rst',
  'adoc',
  'asciidoc',
  'rtf',
]);

const CODE_EXTENSIONS = new Set([
  'astro',
  'babelrc',
  'c',
  'cjs',
  'clj',
  'cmake',
  'conf',
  'config',
  'cpp',
  'cs',
  'css',
  'csv',
  'cts',
  'dockerignore',
  'editorconfig',
  'env',
  'eslintignore',
  'eslintrc',
  'go',
  'graphql',
  'h',
  'hpp',
  'htm',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'json5',
  'jsx',
  'less',
  'lock',
  'log',
  'lua',
  'mjs',
  'mts',
  'php',
  'pl',
  'postcssrc',
  'prettierrc',
  'properties',
  'ps1',
  'py',
  'rb',
  'rs',
  'sass',
  'scss',
  'sh',
  'sql',
  'svelte',
  'toml',
  'ts',
  'tsx',
  'vue',
  'xml',
  'yaml',
  'yml',
]);

const CODE_FILENAMES = new Set([
  '.env',
  '.env.example',
  '.gitignore',
  '.npmrc',
  'Dockerfile',
  'Makefile',
  'Procfile',
]);

export function getFileExtension(name = '') {
  const cleanName = String(name).split(/[\\/]/).pop() || '';
  const match = cleanName.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'ico',
  'avif',
]);

export function isImageFile(name = '') {
  return IMAGE_EXTENSIONS.has(getFileExtension(name));
}

export function isCodeLikeFile(name = '') {
  const cleanName = String(name).split(/[\\/]/).pop() || '';
  if (CODE_FILENAMES.has(cleanName)) return true;
  return CODE_EXTENSIONS.has(getFileExtension(cleanName));
}

export function isDocLikeFile(name = '') {
  return DOC_EXTENSIONS.has(getFileExtension(name));
}

export function fileWindowKind(name = '') {
  if (isImageFile(name)) return 'image';
  if (isCodeLikeFile(name) && !isDocLikeFile(name)) return 'code_editor';
  return 'doc';
}

export function fileLanguage(name = '') {
  const ext = getFileExtension(name);
  if (!ext) return CODE_FILENAMES.has(String(name).split(/[\\/]/).pop() || '') ? 'text' : '';
  if (ext === 'yml') return 'yaml';
  if (ext === 'htm') return 'html';
  return ext;
}

export function fileWindowProps(node, githubRepo) {
  const kind = fileWindowKind(node.name);
  return {
    title: node.name,
    fileName: node.name,
    filePath: node.path,
    isGithub: !!githubRepo,
    githubRepo,
    ...(kind === 'code_editor' ? { language: fileLanguage(node.name) || 'text' } : {}),
  };
}
