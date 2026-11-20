import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'src/generated/**',
      'dist/**',
      'node_modules/**',
      'runtime/python/vendor/**',
      'runtime/dotnet/**',
    ],
  },
  { languageOptions: { globals: globals.node } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // C001-CON-09: the core never imports the UI server or the web client.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui-server/**', '**/ui-server'], message: 'C001-CON-09' },
            { group: ['**/web/**', '**/web'], message: 'C001-CON-09' },
          ],
        },
      ],
    },
  },
  {
    // The CLI reaches the core only through the core API (C001-IF-003, C001-CON-09).
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/core/errors/**',
                '**/core/git/**',
                '**/core/intake/**',
                '**/core/log/**',
                '**/core/orchestrator/**',
                '**/core/store/**',
              ],
              message: 'The CLI calls the core only through src/core/api (C001-IF-003).',
            },
          ],
        },
      ],
    },
  },
);
