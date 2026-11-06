// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const jestGlobals = Object.fromEntries(
  ['describe', 'test', 'it', 'expect', 'jest', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach'].map((name) => [
    name,
    'readonly',
  ]),
);

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.venv/*', '.browser-profile/*', 'data/*', '_site/*'],
  },
  {
    files: ['__tests__/**/*.js'],
    languageOptions: { globals: jestGlobals },
  },
]);
