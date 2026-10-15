// ESLint flat config (ESLint 10). Replaces the old .eslintrc.json.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      "dist/",
      "dist-landing/",
      "dist-site/",
      "dist-demo/",
      "docs-site/public/",
      "docs-site/site/",
      "node_modules/",
      "coverage/",
      "src-tauri/target/",
      "src-tauri/gen/",
      "public/games/driftholm/driftholm.js",
      "games/driftholm/target/",
      ".homebase-state/",
      "tools/scaffolder/templates/",
      "public/playground/vendor/",
      "vendor/three-editor/",
      "docs/legacy/",
      "fuzz/legacy-src/"
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.es2021, ...globals.node, ...globals.browser },
    },
    linterOptions: {
      // ESLint 8 never reported stale eslint-disable comments; keep it that way.
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // caughtErrors 'none' was the ESLint 8 default.
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, caughtErrors: 'none' }],
      'no-useless-escape': 'warn',
      // New in ESLint 10's recommended set; warnings for now so existing code
      // keeps passing. Tighten to errors once those spots are cleaned up.
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    // .cjs files stay CommonJS (the flat-config default for them).
    files: ['**/*.js', '**/*.jsx', '**/*.mjs'],
    languageOptions: { sourceType: 'module' },
  },
  {
    files: ['src/lib/studio/studioWorklet.js'],
    languageOptions: { globals: globals.audioWorklet },
  },
  {
    files: ["**/*.test.js", "**/*.test.jsx", "tests/**/*.js", "tests/**/*.jsx"],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ["src/components/**/*.js", "src/components/**/*.jsx", "src/app/**/*.js", "src/app/**/*.jsx"],
    ignores: [
      "src/components/music/musicSkins.js",
      "src/components/music/MusicDevice.jsx",
      "src/components/music/visualizerSignal.js",
      "src/components/windows/terminalThemePresets.jsx",
      "src/components/windows/WindowThemePanel.jsx",
      "src/components/terminal/canvasTerminalTheme.js",
      "src/components/windows/imageStudio/constants.js",
      "src/components/excalidraw/**",
      "src/components/whiteboard/**",
      "src/components/canvas/CanvasState.js",
      "src/components/landing/**",
      "src/components/Landing.jsx",
      "src/components/Login.jsx"
    ],
    rules: {
      'no-restricted-syntax': [
        "error",
        {
          "selector": "Property[key.name=/^(borderRadius|fontSize)$/] > Literal[value>0]",
          "message": "Use a radius or type token (var(--radius-md), var(--text-sm), ...) instead of a number. See src/styles/tokens.css."
        },
        {
          "selector": "Property[key.name=/^(borderRadius|fontSize)$/] > ConditionalExpression > Literal[value>0]",
          "message": "Use a radius or type token instead of a number. See src/styles/tokens.css."
        },
        {
          "selector": "Property[key.name=/^(borderRadius|fontSize)$/] > Literal[value=/^\\d*\\.?\\d+(px|rem)$/]",
          "message": "Use a radius or type token instead of a px value. See src/styles/tokens.css."
        },
        {
          "selector": "Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b/]",
          "message": "Raw hex color: use a semantic token (var(--surface), var(--ink), var(--accent), var(--danger), ...). See src/styles/tokens.css."
        },
        {
          "selector": "TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b/]",
          "message": "Raw hex color: use a semantic token. See src/styles/tokens.css."
        },
        {
          "selector": "Literal[value=/rgba?\\(/]",
          "message": "Raw rgba() color: use a semantic token, or color-mix() on one. See src/styles/tokens.css."
        },
        {
          "selector": "TemplateElement[value.raw=/rgba?\\(/]",
          "message": "Raw rgba() color: use a semantic token, or color-mix() on one. See src/styles/tokens.css."
        }
      ],
    },
  },
];
