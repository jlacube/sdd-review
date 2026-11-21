# Fluent, decorator-free validation builder

## Summary

class-validator has two ways to declare rules: decorators, which need classes you own and the
`experimentalDecorators` compiler flag, and `registerSchema` JSON schemas, which are untyped
(`type: 'minLength', constraints: [3]`) and easy to get wrong. Users who validate classes from
third-party packages, plain objects coming from configuration files, or who build rules at runtime
have neither type safety nor discoverability.

This issue proposes a typed, chainable builder that produces the same validation metadata the
decorators produce.

## Proposed API

```ts
const userRules = rules<User>()
  .field('email', (f) => f.isDefined().isEmail())
  .field('name', (f) => f.isString().length(2, 50, { message: 'name too short' }))
  .field('tags', (f) =>
    f
      .isOptional()
      .isArray()
      .arrayMaxSize(10)
      .each((e) => e.isString().maxLength(20)),
  )
  .field('address', (f) => f.validateNested(addressRules))
  .field('age', (f) =>
    f
      .validateIf((u) => u.adult)
      .isInt()
      .min(18),
  );

applyRules(User, userRules); // attach to a class, as if decorated
registerRules('user', userRules); // or register under a schema name for validate('user', obj)
```

- `rules<T>()` returns a builder whose `field(name, configure)` only accepts keys of `T`.
- The field builder exposes one method per built-in decorator (type checkers, common, number,
  string, date, array and object decorators), with the decorator's parameters followed by an
  optional `{ message, groups, always, context }`.
- Modifiers: `isOptional()`, `validateIf(condition)`, `each(configure)` (applies the configured
  rules to each element, like `each: true`), `groups(...names)` (applies to the following rules),
  `custom(constraintClass, constraints?, options?)`, `validateNested(rules | class)`,
  `validateBy({ name, validator, message })` for inline checks.
- `applyRules(target, rules)`, `registerRules(name, rules)`, `unregisterRules(name)`.
- `rulesToValidationSchema(name, rules)` and `rulesFromValidationSchema(schema)` convert between
  builders and the existing JSON `ValidationSchema` format where the rules can be expressed there.
- `validatePlain(rules, object, options?)` / `validatePlainSync(...)` validate a plain object
  without a class.

## Expected behaviour

- A class configured with the builder produces exactly the same errors (`property`, `constraints`
  keys and messages, `children`) as the same class configured with decorators, for every built-in
  decorator, with `each`, groups, `always`, `strictGroups`, `skipMissingProperties`, whitelisting,
  `forbidNonWhitelisted` and `stopAtFirstError`.
- Rules applied to a base class are inherited by subclasses as decorators are.
- Applying the same rules twice to a class does not duplicate errors.
- Builders are immutable: deriving a builder (`base.field(...)`) never changes `base`.
- Invalid use fails early: unknown field names are a type error; a `validateNested` target that is
  neither a builder nor a class, or `length(min, max)` with `min > max`, throws when the rule is
  built.

## Notes

- New code under `src/builder/`, exported from the index; the field builder should reuse the
  existing validator functions and default messages rather than duplicate them.
- `MetadataStorage` needs a way to tell whether metadata for a target came from the builder, to
  make re-application idempotent.
- Tests: a parity suite comparing builder and decorator results per decorator group, builder
  unit tests, schema conversion tests, plain-object validation tests.
- Documentation page under `docs/basics/`, README section, and a sample under `sample/`.
