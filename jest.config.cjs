module.exports = {
  testEnvironment: 'node',
  // Real git / temp-repo cases (projectGit, merge desk) need more than Jest's
  // default 5s when the suite runs as a full gate shard under pre-push load.
  testTimeout: 30_000,
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
  testMatch: ['<rootDir>/**/*.test.js', '<rootDir>/**/*.test.jsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-landing/',
    '/dist-demo/',
    '/tools/db-tools/',
  ],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.cjs' }],
    '\\.svg(\\?raw)?$': '<rootDir>/tests/svgRawTransformer.cjs',
  },
  extensionsToTreatAsEsm: ['.jsx'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/styleMock.js',
    '\\?raw$': '<rootDir>/tests/rawSvgLoader.cjs',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    'server/**/*.js',
    'shared/**/*.js',
    '!src/main.jsx',
    '!src/landing-main.jsx',
    '!**/*.test.{js,jsx}',
  ],
};
