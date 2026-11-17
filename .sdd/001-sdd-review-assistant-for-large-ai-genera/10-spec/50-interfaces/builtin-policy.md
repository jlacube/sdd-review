---
id: "C001-IF-005"
artifact: spec/interface
change: "CHG-001"
phase: 10-spec
status: draft
kind: conventions
---
# C001-IF-005 — Built-in clearing policy and file conventions

The built-in lists below are part of every review configuration and cannot be removed or narrowed
(C001-REQ-425). A repository adds to them through C001-IF-004. Changing a list here is a change of
this interface (new `formatVersion` of the configuration is not needed; the release notes name it).

## §1 Pattern syntax
1. A pattern is matched against the whole repository-relative path, `/` as separator.
2. `*` matches any characters except `/`; `?` one character except `/`; `**` as a whole segment
   matches zero or more segments; `{a,b}` matches either alternative; `[abc]` one listed character.
3. A pattern without `/` matches the file name at any depth (`Dockerfile` equals `**/Dockerfile`).
4. Built-in patterns match case-insensitively; configured patterns match case-sensitively on
   every operating system (C001-NFR-015, C001-NFR-016).

## §2 Built-in guarded areas
| Area ID | Name shown | Recognition | Requirement |
|---|---|---|---|
| `security-auth` | Security and authentication | §3 terms, §4 libraries | C001-REQ-414 |
| `data-migration` | Data migration | §5 | C001-REQ-415 |
| `dependency-build-config` | Dependency, build and configuration | §6 | C001-REQ-416 |
| `public-api` | Public API | §7 | C001-REQ-417 |

The area IDs are reserved names in `clearing.guardedAreas` (C001-IF-004). The criterion recorded
with a match names the section and the term, library or pattern that matched, for example
`security term "token" in identifier refreshToken`.

## §3 Security term list
A hunk matches when a word of its file path, or of an identifier on one of its changed lines,
equals a term. Words are split at non-alphanumeric characters, at lower-to-upper case changes and
at letter-digit changes, then lower-cased (`refreshToken` → `refresh`, `token`; `OAuth2Client` →
`o`, `auth`, `2`, `client`). Two-word terms match two consecutive words.

auth, authn, authz, authenticate, authentication, authenticator, authorize, authorization,
authorizer, permission, permissions, privilege, privileges, role, roles, rbac, acl, login, logout,
signin, signon, sso, session, sessions, cookie, cookies, password, passwords, passwd, passphrase,
credential, credentials, secret, secrets, token, tokens, jwt, jws, jwk, oauth, oidc, saml, mfa, otp,
totp, csrf, xsrf, cors, crypto, cryptography, cipher, encrypt, encryption, decrypt, decryption,
hmac, salt, keystore, keychain, certificate, certificates, cert, tls, ssl, x509, xss, sanitize,
sanitizer, security, impersonate, impersonation, "api key", apikey.

## §4 Security library list
A hunk matches when one of its added or deleted lines imports, requires or uses one of these
modules or namespaces (a trailing `*` matches any suffix).

| Ecosystem | Modules and namespaces |
|---|---|
| TypeScript/JavaScript | `crypto`, `node:crypto`, `jsonwebtoken`, `jose`, `passport`, `passport-*`, `bcrypt`, `bcryptjs`, `argon2`, `express-session`, `cookie-session`, `helmet`, `csurf`, `next-auth`, `next-auth/*`, `@auth/*`, `openid-client`, `oidc-client-ts`, `@azure/msal-*`, `keycloak-js`, `@okta/*`, `node-forge`, `tweetnacl`, `crypto-js`, `sanitize-html`, `dompurify`, `isomorphic-dompurify`, `xss` |
| Python | `hashlib`, `hmac`, `secrets`, `ssl`, `cryptography*`, `Crypto*`, `nacl*`, `jwt`, `jose*`, `authlib*`, `oauthlib*`, `requests_oauthlib`, `passlib*`, `bcrypt`, `argon2*`, `itsdangerous`, `django.contrib.auth*`, `django.middleware.csrf`, `flask_login`, `flask_jwt_extended`, `fastapi.security*`, `starlette.authentication`, `bleach` |
| C#/.NET | `System.Security.*`, `System.IdentityModel.*`, `Microsoft.IdentityModel.*`, `Microsoft.AspNetCore.Authentication*`, `Microsoft.AspNetCore.Authorization*`, `Microsoft.AspNetCore.Identity*`, `Microsoft.AspNetCore.DataProtection*`, `Microsoft.AspNetCore.Antiforgery*`, `Microsoft.AspNetCore.Cors*`, `Microsoft.Identity.*`, `Azure.Identity*`, `Azure.Security.KeyVault.*`, `Duende.IdentityServer*`, `IdentityServer4*`, `OpenIddict*`, `BCrypt.Net*` |

## §5 Data-migration patterns
`**/*.sql`, `**/migrations/**`, `**/migration/**`, `**/alembic/versions/**`, `**/seeders/**`,
`**/seeds/**`, `**/drizzle/meta/**`, `**/*ModelSnapshot.cs`, `**/db/changelog/**`,
`**/liquibase/**`, `**/flyway/**`. These cover Prisma, TypeORM, Knex, Sequelize and Drizzle;
Django, Alembic and Flask-Migrate; Entity Framework Core; Flyway and Liquibase (C001-REQ-415).

## §6 Dependency, build and configuration patterns
| Group | Patterns |
|---|---|
| Manifests and lock files | `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `bun.lock`, `bun.lockb`, `.npmrc`, `.yarnrc`, `.yarnrc.yml`, `pyproject.toml`, `requirements*.txt`, `**/requirements/*.txt`, `constraints*.txt`, `setup.py`, `setup.cfg`, `Pipfile`, `Pipfile.lock`, `poetry.lock`, `uv.lock`, `pdm.lock`, `environment.yml`, `*.csproj`, `*.fsproj`, `*.vbproj`, `*.sln`, `*.slnx`, `Directory.Packages.props`, `Directory.Build.props`, `Directory.Build.targets`, `packages.lock.json`, `packages.config`, `nuget.config`, `global.json`, `go.mod`, `go.sum`, `Cargo.toml`, `Cargo.lock`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `settings.gradle*`, `gradle.properties`, `Gemfile`, `Gemfile.lock`, `composer.json`, `composer.lock` |
| Build definitions | `Makefile`, `*.mk`, `CMakeLists.txt`, `*.cmake`, `*.props`, `*.targets`, `tsconfig*.json`, `jsconfig.json`, `webpack.config.*`, `vite.config.*`, `vitest.config.*`, `jest.config.*`, `rollup.config.*`, `esbuild.config.*`, `babel.config.*`, `.babelrc*`, `turbo.json`, `nx.json`, `lerna.json`, `tox.ini`, `noxfile.py`, `justfile`, `Taskfile.yml` |
| CI pipeline definitions | `.github/workflows/**`, `.github/actions/**`, `.gitlab-ci.yml`, `azure-pipelines*.yml`, `.azure-pipelines/**`, `.circleci/**`, `Jenkinsfile`, `.buildkite/**`, `.travis.yml`, `bitbucket-pipelines.yml`, `.drone.yml`, `appveyor.yml` |
| Container and deployment definitions | `Dockerfile`, `Dockerfile.*`, `*.dockerfile`, `Containerfile`, `.dockerignore`, `docker-compose*.yml`, `docker-compose*.yaml`, `compose.yml`, `compose.yaml`, `.devcontainer/**`, `devcontainer.json`, `**/charts/**`, `**/helm/**`, `**/k8s/**`, `kustomization.yaml`, `*.tf`, `*.tfvars`, `*.bicep` |
| Configuration files | `.env`, `.env.*`, `*.config`, `appsettings*.json`, `*.ini`, `*.cfg`, `*.conf`, `*.properties`, `**/config/**`, `**/configs/**`, `settings.py`, `**/settings/*.py`, `.editorconfig`, `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `ruff.toml`, `.flake8`, `mypy.ini`, `.gitattributes`, `.gitignore`, `.gitmodules`, `CODEOWNERS`, `.sdd-review/**` |

The last pattern covers the review configuration itself (C001-REQ-416, C001-REQ-426).

## §7 API description files and public API
**API description files** (every language): `openapi*.{json,yaml,yml}`, `swagger*.{json,yaml,yml}`,
`*.openapi.{json,yaml,yml}`, any other JSON or YAML file whose top-level object has an `openapi` or
`swagger` key, `*.graphql`, `*.graphqls`, `*.gql`, `*.proto`. Every hunk of such a file matches.

**Public API symbols** of the deep ecosystems follow the recognition rule of the C001-REQ-417
rationale, made exact below. Recognition uses the syntax trees of the base-commit side and the
snapshot side of each file (C001-COMP-007), with no type checking, no build and no model, so the
public-API part of the open share of C001-NFR-005 can be computed by static analysis alone.

### §7.1 Public API symbols per ecosystem
| Ecosystem | A symbol is public when it is | Identity of a symbol across the two sides |
|---|---|---|
| TypeScript/JavaScript | exported from its module: a declaration preceded by `export` (function, class, interface, type alias, enum, namespace, variable statement, `declare` form); the `export default` declaration or expression (name `default`); a name listed in an `export { … }` or `export … from` statement, together with the declaration of that name in the same file; `export =`; at module top level, an assignment to `module.exports`, `module.exports.<name>` or `exports.<name>`; every top-level declaration of a declaration file (`*.d.ts`, `*.d.mts`, `*.d.cts`). Also every member of an exported class, interface, enum or type literal, unless the member is `private` or has a `#` name. | repository path of the module, qualified name in the module, kind |
| Python | a module-level name: function, class, assignment or annotated assignment, also inside module-level `if`, `try` and `with` blocks, and the `__all__` assignment; a name bound by a module-level import, but only when the file is `__init__.py` or `__init__.pyi`, the import has the form `import x as x` or `from m import x as x`, or `__all__` lists the name; a class-level name (method, nested class, class attribute, annotation) of a public class. A name is not public when it starts with `_` and is not a dunder name (starting and ending with `__`, such as `__init__`); a class is public when its name is public and every class that contains it is public. | repository path of the module, qualified name in the module, kind |
| C#/.NET | a type (class, struct, interface, enum, delegate, record, record struct) declared `public`, a nested type only when every containing type is public; a `partial` type is public when any of its declarations on the same side says `public`. A member of a public type declared `public`, `protected` or `protected internal` (constructor, method, property, indexer, event, field, constant, operator, conversion operator, nested type); every member of a public interface not declared `private` or `internal`; every member of a public enum; the parameters of the primary constructor of a public record. | namespace-qualified name of the type and member, kind, parameter types |

Files of test hunks (§10) hold no public API symbol: tests are not used by code outside them
(glossary, public API). A file analysed as `other` (§8) holds none either; its hunks stay subject to
the other areas and rules.

### §7.2 Declaration head
The head of a declaration is the part that states its visibility, kind, name, parameters and type:

| Declaration | Head |
|---|---|
| function, method, constructor, operator, conversion operator | decorators or attributes, modifiers, name, type parameters, parameters with their types and defaults, return type and constraints, up to the opening `{` of the body, the `:` that ends a Python header, the `=>` of an expression body, or the `;` of a declaration without a body |
| variable, field or Python assignment whose value is a function, arrow function, lambda or class expression | as for a function, the variable name and its type annotation included |
| any other variable, field, constant, Python assignment, enum member, type alias, `__all__`, export statement, `export =`, `module.exports` assignment | the whole statement: the value of a constant is compiled into its users in C#, and the value of a type alias is its type |
| class, struct, record, interface, enum, namespace, delegate | attributes or decorators, modifiers, name, type parameters, base list, primary-constructor parameters and constraints, up to the opening `{` or the `:` of a Python class header; members are symbols of their own |
| member of a TypeScript interface or type literal, overload or abstract signature, `declare` form | the whole member or signature |
| C# property, indexer or event | attributes, modifiers, type, name, parameters and the accessor list without accessor bodies |

A line belongs to a head when any character of the head lies on it; a line holding only whitespace
or a comment never does.

### §7.3 Matching hunks
The public symbols of the two sides of a file are paired by their identity (§7.1). A symbol is
**added** when only the snapshot side has it, **removed** when only the base side has it, and
**changed** when both sides have it and their heads differ once whitespace and comments are
ignored (for an overloaded name, all its heads are compared together). A renamed symbol is one
removed and one added symbol. A hunk of a file of a deep ecosystem is in the public API area when
one of its added lines belongs to the snapshot-side head of an added or changed symbol, or one of its
deleted lines belongs to the base-side head of a removed or changed symbol. A hunk that changes
only the body of a public symbol, or moves a symbol within its file without changing its head,
does not match on that symbol. A symbol moved to another module of TypeScript, JavaScript or Python
is removed from one module and added to another, so both hunks match; a C# member or type moved to
another file keeps its identity and does not match.

### §7.4 Criterion recorded
The criterion of a public API match names the symbol, its kind, the change and the side and line of
the head, for example `public API: exported function createOrder added, snapshot line 12` or
`public API: public method OrderService.Cancel(int) changed, base line 40`. With the criteria of §3
to §6, the recorded criteria let the open share of C001-NFR-005 be split by guarded area and
criterion (C001-AS-07).

## §8 Ecosystem assignment
| Ecosystem | Files |
|---|---|
| TypeScript/JavaScript | `*.ts`, `*.tsx`, `*.mts`, `*.cts`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs` |
| Python | `*.py`, `*.pyi` |
| C#/.NET | `*.cs` |
| other | every other file; analysed by the language-agnostic core only |

A file whose content does not parse with the parser of its ecosystem is analysed as `other` and its
results are labelled reduced (C001-REQ-212, C001-REQ-323).

## §9 Defaults
| Setting | Default | Source |
|---|---|---|
| Clearing rules | all five enabled | C001-REQ-406 to C001-REQ-410 |
| Additional guarded areas, generated-file patterns, test path patterns, coverage reports | none | C001-REQ-409, C001-REQ-423, C001-REQ-501, C001-REQ-507 |
| Test command | none | C001-REQ-505 |
| Scenario command | none | C001-REQ-510 |
| Minimum clone length | 6 normalised lines; a normalised line has leading and trailing whitespace removed and inner whitespace runs collapsed to one space; blank lines are skipped | C001-REQ-215 |
| Model provider | none (model-free mode) | C001-REQ-801 |
| Cloud opt-in setting | false | C001-REQ-806 |
| Provider timeout | 120 s per request | C001-REQ-816 |
| Model-excluded path patterns | none | C001-REQ-814 |
| Maximum request size | 60,000 bytes | C001-IF-010 §3 |
| Reading rate (per review, not configured) | 300 changed lines per hour | C001-REQ-611 |
| Sample share (not configurable) | 10 %, at least one hunk per rule | C001-REQ-604 |

## §10 Test-file conventions
| Ecosystem | A hunk is a test hunk when its file matches |
|---|---|
| TypeScript/JavaScript | `*.test.*`, `*.spec.*`, `**/__tests__/**`, `**/test/**`, `**/tests/**`, `**/e2e/**`, `**/cypress/**` (with an extension of §8) |
| Python | `test_*.py`, `*_test.py`, `conftest.py`, `**/tests/**/*.py`, `**/test/**/*.py` |
| C#/.NET | `*Tests.cs`, `*Test.cs`, and every `*.cs` file of a project whose project file references `Microsoft.NET.Test.Sdk` or whose name ends with `.Tests`, `.Test`, `.UnitTests`, `.IntegrationTests` or `.Specs` |
| every language | `*.feature` (Gherkin); `.sdd/**/acceptance.md`; changed lines of `.sdd-review/workspace.json` that all lie inside items of kind `scenario`; the test path patterns of the configuration |

## §11 Generated files
There is no built-in generated-file pattern. A file is generated only when the base commit's
`.gitattributes` files give it the `linguist-generated` attribute set or `true`, or when it matches
a generated-file pattern of the review configuration (C001-REQ-409). A marker inside the file does
not count. Lock files stay guarded by §6 (C001-REQ-413).
