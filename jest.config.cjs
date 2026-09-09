module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
  testMatch: ['<rootDir>/**/*.test.js', '<rootDir>/**/*.test.jsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-landing/',
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
    '!src/main.jsx',
    '!src/landing-main.jsx',
    '!**/*.test.{js,jsx}',
  ],
};
