/**
 * The built-in clearing policy and file conventions of C001-IF-005 (`builtin-policy.md`) §1 to
 * §11, as data. Part of every review configuration; a repository adds to it through C001-IF-004
 * and can never remove or narrow it (C001-REQ-425). The recognisers that apply these lists
 * (C001-COMP-007, -010) belong to the triage tasks; this module only holds the lists.
 */

/** §1: built-in patterns match case-insensitively, configured ones case-sensitively. */
export const PATTERN_SYNTAX = {
  section: '§1',
  builtinCaseInsensitive: true,
  configuredCaseSensitive: true,
} as const;

/** §2: the IDs of the built-in guarded areas, reserved in `clearing.guardedAreas`. */
export const BUILTIN_AREA_IDS = [
  'security-auth',
  'data-migration',
  'dependency-build-config',
  'public-api',
] as const;
export type BuiltinAreaId = (typeof BUILTIN_AREA_IDS)[number];

export interface BuiltinArea {
  readonly id: BuiltinAreaId;
  readonly name: string;
  /** The sections of C001-IF-005 whose lists recognise the area. */
  readonly recognition: readonly string[];
  readonly requirement: string;
}

/** §2. */
export const BUILTIN_AREAS: readonly BuiltinArea[] = [
  {
    id: 'security-auth',
    name: 'Security and authentication',
    recognition: ['§3', '§4'],
    requirement: 'C001-REQ-414',
  },
  {
    id: 'data-migration',
    name: 'Data migration',
    recognition: ['§5'],
    requirement: 'C001-REQ-415',
  },
  {
    id: 'dependency-build-config',
    name: 'Dependency, build and configuration',
    recognition: ['§6'],
    requirement: 'C001-REQ-416',
  },
  {
    id: 'public-api',
    name: 'Public API',
    recognition: ['§7'],
    requirement: 'C001-REQ-417',
  },
];

export function isBuiltinAreaId(name: string): name is BuiltinAreaId {
  return (BUILTIN_AREA_IDS as readonly string[]).includes(name);
}

/** §3: single words, and two-word terms written with a space (matching two consecutive words). */
export const SECURITY_TERMS: readonly string[] = [
  'auth',
  'authn',
  'authz',
  'authenticate',
  'authentication',
  'authenticator',
  'authorize',
  'authorization',
  'authorizer',
  'permission',
  'permissions',
  'privilege',
  'privileges',
  'role',
  'roles',
  'rbac',
  'acl',
  'login',
  'logout',
  'signin',
  'signon',
  'sso',
  'session',
  'sessions',
  'cookie',
  'cookies',
  'password',
  'passwords',
  'passwd',
  'passphrase',
  'credential',
  'credentials',
  'secret',
  'secrets',
  'token',
  'tokens',
  'jwt',
  'jws',
  'jwk',
  'oauth',
  'oidc',
  'saml',
  'mfa',
  'otp',
  'totp',
  'csrf',
  'xsrf',
  'cors',
  'crypto',
  'cryptography',
  'cipher',
  'encrypt',
  'encryption',
  'decrypt',
  'decryption',
  'hmac',
  'salt',
  'keystore',
  'keychain',
  'certificate',
  'certificates',
  'cert',
  'tls',
  'ssl',
  'x509',
  'xss',
  'sanitize',
  'sanitizer',
  'security',
  'impersonate',
  'impersonation',
  'api key',
  'apikey',
];

export type Ecosystem = 'typescript-javascript' | 'python' | 'csharp-dotnet';

/** §4: modules and namespaces per ecosystem; a trailing `*` matches any suffix. */
export const SECURITY_LIBRARIES: Readonly<Record<Ecosystem, readonly string[]>> = {
  'typescript-javascript': [
    'crypto',
    'node:crypto',
    'jsonwebtoken',
    'jose',
    'passport',
    'passport-*',
    'bcrypt',
    'bcryptjs',
    'argon2',
    'express-session',
    'cookie-session',
    'helmet',
    'csurf',
    'next-auth',
    'next-auth/*',
    '@auth/*',
    'openid-client',
    'oidc-client-ts',
    '@azure/msal-*',
    'keycloak-js',
    '@okta/*',
    'node-forge',
    'tweetnacl',
    'crypto-js',
    'sanitize-html',
    'dompurify',
    'isomorphic-dompurify',
    'xss',
  ],
  python: [
    'hashlib',
    'hmac',
    'secrets',
    'ssl',
    'cryptography*',
    'Crypto*',
    'nacl*',
    'jwt',
    'jose*',
    'authlib*',
    'oauthlib*',
    'requests_oauthlib',
    'passlib*',
    'bcrypt',
    'argon2*',
    'itsdangerous',
    'django.contrib.auth*',
    'django.middleware.csrf',
    'flask_login',
    'flask_jwt_extended',
    'fastapi.security*',
    'starlette.authentication',
    'bleach',
  ],
  'csharp-dotnet': [
    'System.Security.*',
    'System.IdentityModel.*',
    'Microsoft.IdentityModel.*',
    'Microsoft.AspNetCore.Authentication*',
    'Microsoft.AspNetCore.Authorization*',
    'Microsoft.AspNetCore.Identity*',
    'Microsoft.AspNetCore.DataProtection*',
    'Microsoft.AspNetCore.Antiforgery*',
    'Microsoft.AspNetCore.Cors*',
    'Microsoft.Identity.*',
    'Azure.Identity*',
    'Azure.Security.KeyVault.*',
    'Duende.IdentityServer*',
    'IdentityServer4*',
    'OpenIddict*',
    'BCrypt.Net*',
  ],
};

/** §5. */
export const DATA_MIGRATION_PATTERNS: readonly string[] = [
  '**/*.sql',
  '**/migrations/**',
  '**/migration/**',
  '**/alembic/versions/**',
  '**/seeders/**',
  '**/seeds/**',
  '**/drizzle/meta/**',
  '**/*ModelSnapshot.cs',
  '**/db/changelog/**',
  '**/liquibase/**',
  '**/flyway/**',
];

/** §6, by group. The last pattern (`.sdd-review/**`) covers the review configuration itself. */
export const DEPENDENCY_BUILD_CONFIG_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  'Manifests and lock files': [
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'bun.lock',
    'bun.lockb',
    '.npmrc',
    '.yarnrc',
    '.yarnrc.yml',
    'pyproject.toml',
    'requirements*.txt',
    '**/requirements/*.txt',
    'constraints*.txt',
    'setup.py',
    'setup.cfg',
    'Pipfile',
    'Pipfile.lock',
    'poetry.lock',
    'uv.lock',
    'pdm.lock',
    'environment.yml',
    '*.csproj',
    '*.fsproj',
    '*.vbproj',
    '*.sln',
    '*.slnx',
    'Directory.Packages.props',
    'Directory.Build.props',
    'Directory.Build.targets',
    'packages.lock.json',
    'packages.config',
    'nuget.config',
    'global.json',
    'go.mod',
    'go.sum',
    'Cargo.toml',
    'Cargo.lock',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle*',
    'gradle.properties',
    'Gemfile',
    'Gemfile.lock',
    'composer.json',
    'composer.lock',
  ],
  'Build definitions': [
    'Makefile',
    '*.mk',
    'CMakeLists.txt',
    '*.cmake',
    '*.props',
    '*.targets',
    'tsconfig*.json',
    'jsconfig.json',
    'webpack.config.*',
    'vite.config.*',
    'vitest.config.*',
    'jest.config.*',
    'rollup.config.*',
    'esbuild.config.*',
    'babel.config.*',
    '.babelrc*',
    'turbo.json',
    'nx.json',
    'lerna.json',
    'tox.ini',
    'noxfile.py',
    'justfile',
    'Taskfile.yml',
  ],
  'CI pipeline definitions': [
    '.github/workflows/**',
    '.github/actions/**',
    '.gitlab-ci.yml',
    'azure-pipelines*.yml',
    '.azure-pipelines/**',
    '.circleci/**',
    'Jenkinsfile',
    '.buildkite/**',
    '.travis.yml',
    'bitbucket-pipelines.yml',
    '.drone.yml',
    'appveyor.yml',
  ],
  'Container and deployment definitions': [
    'Dockerfile',
    'Dockerfile.*',
    '*.dockerfile',
    'Containerfile',
    '.dockerignore',
    'docker-compose*.yml',
    'docker-compose*.yaml',
    'compose.yml',
    'compose.yaml',
    '.devcontainer/**',
    'devcontainer.json',
    '**/charts/**',
    '**/helm/**',
    '**/k8s/**',
    'kustomization.yaml',
    '*.tf',
    '*.tfvars',
    '*.bicep',
  ],
  'Configuration files': [
    '.env',
    '.env.*',
    '*.config',
    'appsettings*.json',
    '*.ini',
    '*.cfg',
    '*.conf',
    '*.properties',
    '**/config/**',
    '**/configs/**',
    'settings.py',
    '**/settings/*.py',
    '.editorconfig',
    '.eslintrc*',
    'eslint.config.*',
    '.prettierrc*',
    'prettier.config.*',
    'ruff.toml',
    '.flake8',
    'mypy.ini',
    '.gitattributes',
    '.gitignore',
    '.gitmodules',
    'CODEOWNERS',
    '.sdd-review/**',
  ],
};

/** §7: API description files of every language; every hunk of such a file matches. */
export const API_DESCRIPTION_PATTERNS: readonly string[] = [
  'openapi*.{json,yaml,yml}',
  'swagger*.{json,yaml,yml}',
  '*.openapi.{json,yaml,yml}',
  '*.graphql',
  '*.graphqls',
  '*.gql',
  '*.proto',
];

/** §7: a JSON or YAML file whose top-level object has one of these keys is an API description. */
export const API_DESCRIPTION_TOP_LEVEL_KEYS: readonly string[] = ['openapi', 'swagger'];

/** §7.1 to §7.4: public API symbols are recognised in the deep ecosystems only. */
export const PUBLIC_API_ECOSYSTEMS: readonly Ecosystem[] = [
  'typescript-javascript',
  'python',
  'csharp-dotnet',
];

/** §8: ecosystem assignment; every other file is `other`. */
export const ECOSYSTEM_FILES: Readonly<Record<Ecosystem, readonly string[]>> = {
  'typescript-javascript': ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs'],
  python: ['*.py', '*.pyi'],
  'csharp-dotnet': ['*.cs'],
};

export type ClearingRuleName =
  'pureMove' | 'pureRename' | 'formatting' | 'generatedFile' | 'passingTests';

export const CLEARING_RULES: readonly ClearingRuleName[] = [
  'pureMove',
  'pureRename',
  'formatting',
  'generatedFile',
  'passingTests',
];

/** §9: the defaults of every setting the configuration can give. */
export const DEFAULTS = {
  /** All five clearing rules enabled (C001-REQ-406 to C001-REQ-410). */
  clearingRules: {
    pureMove: true,
    pureRename: true,
    formatting: true,
    generatedFile: true,
    passingTests: true,
  } satisfies Record<ClearingRuleName, boolean>,
  generatedFiles: [] as readonly string[],
  guardedAreas: [] as readonly never[],
  testPathPatterns: [] as readonly string[],
  coverageReports: [] as readonly string[],
  testCommand: null,
  scenarioCommand: null,
  /** Normalised lines: trimmed, inner whitespace runs collapsed, blank lines skipped. */
  minCloneLength: 6,
  provider: null,
  cloudOptIn: false,
  timeoutSeconds: 120,
  excludedPaths: [] as readonly string[],
  maxRequestBytes: 60_000,
  responseFormat: 'json-schema',
  maxOutputTokens: 4096,
  /** Per review, not configured (C001-REQ-611). */
  readingRateLinesPerHour: 300,
  /** Not configurable (C001-REQ-604): 10 %, at least one hunk per rule. */
  sampleShare: 0.1,
  sampleMinimumPerRule: 1,
} as const;

/** §10: test-file conventions per ecosystem (plus the configured test path patterns). */
export const TEST_FILE_PATTERNS: Readonly<Record<Ecosystem | 'every-language', readonly string[]>> =
  {
    'typescript-javascript': [
      '*.test.*',
      '*.spec.*',
      '**/__tests__/**',
      '**/test/**',
      '**/tests/**',
      '**/e2e/**',
      '**/cypress/**',
    ],
    python: ['test_*.py', '*_test.py', 'conftest.py', '**/tests/**/*.py', '**/test/**/*.py'],
    'csharp-dotnet': ['*Tests.cs', '*Test.cs'],
    'every-language': ['*.feature', '.sdd/**/acceptance.md'],
  };

/** §10: a C# project is a test project when it references this package or its name ends so. */
export const CSHARP_TEST_PROJECT = {
  package: 'Microsoft.NET.Test.Sdk',
  nameSuffixes: ['.Tests', '.Test', '.UnitTests', '.IntegrationTests', '.Specs'],
} as const;

/** §10: changed lines of this file that all lie inside items of kind `scenario` are test hunks. */
export const WORKSPACE_SCENARIO_FILE = '.sdd-review/workspace.json';

/** §11: no built-in generated-file pattern; only `.gitattributes` and the configuration count. */
export const GENERATED_FILE_PATTERNS: readonly string[] = [];
export const GENERATED_ATTRIBUTE = 'linguist-generated';
