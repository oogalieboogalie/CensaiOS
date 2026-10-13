export const ALWAYS_IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out',
  '.cache', '.vite', '.parcel-cache', '.turbo', '__pycache__', '.pytest_cache',
  '.venv', 'venv', 'env', '.DS_Store', 'coverage', '.nyc_output',
]);

export const ENTRY_FILENAMES = [
  'index.js', 'index.ts', 'index.jsx', 'index.tsx', 'index.mjs',
  'main.js', 'main.ts', 'main.py', 'main.go', 'main.rs',
  'app.js', 'app.ts', 'app.jsx', 'app.tsx', 'app.py',
  'server.js', 'server.ts', 'server.py',
  'cli.js', 'cli.ts', 'bin.js',
  'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml', 'build.gradle',
];
