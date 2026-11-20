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
      // Input of the forbidden-HTML rule's self-test; it breaks the rule on purpose.
      'test/fixtures/lint-selftest/**',
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
    // C001-CON-09: the UI server reaches the core only through src/core/api, and knows neither
    // the CLI nor the web client.
    files: ['src/ui-server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/**', '!**/core/api', '!**/core/api/**'],
              message: 'The UI server calls the core only through src/core/api (C001-CON-09).',
            },
            { group: ['**/cli/**', '**/cli'], message: 'C001-CON-09' },
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
  {
    // C001-ADR-002 items 1 and 2, C001-CON-20: the web client renders repository content, named
    // files, transcripts and model output only as React text nodes, and loads styles only from
    // static CSS files.
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden: render text nodes only (C001-CON-20).',
        },
        {
          selector:
            "Property[key.name='dangerouslySetInnerHTML'], Property[key.value='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden: render text nodes only (C001-CON-20).',
        },
        {
          selector:
            'MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment)$/]',
          message: 'Writing HTML is forbidden: render text nodes only (C001-CON-20).',
        },
        {
          selector:
            'MemberExpression[computed=true][property.value=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]',
          message: 'Writing HTML is forbidden: render text nodes only (C001-CON-20).',
        },
        {
          selector: "CallExpression[callee.property.name='write'][callee.object.name='document']",
          message: 'document.write is forbidden (C001-CON-20).',
        },
        {
          selector: "NewExpression[callee.name='DOMParser']",
          message: 'Parsing HTML is forbidden: render text nodes only (C001-CON-20).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/**', '**/ui-server/**', '**/cli/**'],
              message:
                'The web client imports no code of the core, the server or the CLI (C001-CON-09).',
            },
            {
              group: [
                'highlight.js',
                'highlight.js/*',
                'prismjs',
                'prismjs/*',
                'shiki',
                'shiki/*',
                'react-syntax-highlighter',
                'react-syntax-highlighter/*',
                'react-highlight',
                'react-highlight.js',
                'lowlight',
                'refractor',
                'markdown-it',
                'marked',
                'showdown',
                'dompurify',
              ],
              message:
                'HTML-producing highlighters and renderers are forbidden (C001-ADR-002 item 2).',
            },
            {
              group: [
                'styled-components',
                'styled-components/*',
                '@emotion/*',
                'goober',
                'styled-jsx',
                'styled-jsx/*',
                '@stitches/*',
                'aphrodite',
                'jss',
                'jss/*',
                'react-jss',
                '@linaria/*',
                'twin.macro',
                'glamor',
                'radium',
                'styletron-*',
              ],
              message:
                'CSS-in-JS libraries are forbidden: styles are static CSS files (C001-ADR-002 item 1).',
            },
          ],
        },
      ],
    },
  },
);
