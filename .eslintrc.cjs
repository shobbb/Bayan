/**
 * Layer boundaries (§2.1): ui -> domain -> data, one direction only.
 * services/ sits beside domain/ for non-persistence I/O and may be used from ui/,
 * never from domain/. Capacitor may only be imported inside services/platform/ (REQ-P5).
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'import', 'react-hooks'],
  ignorePatterns: ['dist', 'ios', 'android', 'node_modules', '*.cjs', 'capacitor.config.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@capacitor/*'],
            message: 'Capacitor may only be imported inside services/platform/ (REQ-P5).',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['src/domain/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { group: ['@/data/*', '@/ui/*', '@/services/*', '@capacitor/*'], message: 'domain/ is pure: no data, ui, services, or Capacitor imports (§2.1, REQ-4).' },
            ],
          },
        ],
      },
    },
    {
      files: ['src/data/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { group: ['@/ui/*', '@/services/*', '@capacitor/*'], message: 'data/ is a persistence layer only: no ui, services, or Capacitor imports (§2.1).' },
            ],
          },
        ],
      },
    },
    {
      files: ['src/services/platform/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
