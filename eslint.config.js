import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// C001-CON-11, C001-CON-12 (C001-T-085): the model gateway in src/core/model/ is the only module
// that may open an outbound connection; the UI server may only listen. Type-only imports open
// nothing and stay allowed. Enforced with the typescript-eslint variant of the rule so that it
// adds to, and does not replace, the module rules of C001-CON-09 below.
const OUTBOUND_MESSAGE =
  'Outbound network access is reserved to the model gateway in src/core/model/ (C001-CON-11, C001-CON-12).';
const OUTBOUND_CLIENTS = [
  'https',
  'http2',
  'tls',
  'dgram',
  'dns',
  'dns/promises',
  'undici',
  'node-fetch',
  'cross-fetch',
  'isomorphic-fetch',
  'axios',
  'got',
  'ky',
  'needle',
  'request',
  'superagent',
  'ws',
  'socket.io-client',
];
const nodeAndBare = (name) =>
  name.includes('-') || name === 'request' ? [name] : [name, `node:${name}`];
const outboundPaths = (listen) => [
  ...OUTBOUND_CLIENTS.flatMap(nodeAndBare).map((name) => ({
    name,
    message: OUTBOUND_MESSAGE,
    allowTypeImports: true,
  })),
  ...['http', 'node:http'].map((name) => ({
    name,
    allowTypeImports: true,
    message: listen
      ? `${OUTBOUND_MESSAGE} The UI server may only listen: createServer and the server types.`
      : OUTBOUND_MESSAGE,
    ...(listen
      ? {
          allowImportNames: [
            'createServer',
            'IncomingMessage',
            'IncomingHttpHeaders',
            'OutgoingHttpHeaders',
            'Server',
            'ServerResponse',
            'STATUS_CODES',
          ],
        }
      : {}),
  })),
  ...['net', 'node:net'].map((name) => ({
    name,
    allowTypeImports: true,
    message: listen
      ? `${OUTBOUND_MESSAGE} The UI server may only listen: address checks of node:net only.`
      : OUTBOUND_MESSAGE,
    ...(listen ? { allowImportNames: ['isIP', 'isIPv4', 'isIPv6'] } : {}),
  })),
];
const outboundRule = (listen) => ({
  '@typescript-eslint/no-restricted-imports': [
    'error',
    { paths: outboundPaths(listen), patterns: [] },
  ],
  'no-restricted-globals': [
    'error',
    ...['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest'].map((name) => ({
      name,
      message: OUTBOUND_MESSAGE,
    })),
  ],
});

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
    // The UI spike's prototype page (C001-T-023) is held to the same rules.
    files: ['web/**/*.{ts,tsx}', 'spikes/ui/app/**/*.{ts,tsx}'],
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
  {
    // C001-CON-11, C001-CON-12: no outbound network client outside the model gateway.
    files: ['src/**/*.ts'],
    ignores: ['src/core/model/**'],
    rules: outboundRule(false),
  },
  {
    // The UI server listens on 127.0.0.1 and opens no outbound connection (C001-CON-10, -11).
    files: ['src/ui-server/**/*.ts'],
    rules: outboundRule(true),
  },
);
