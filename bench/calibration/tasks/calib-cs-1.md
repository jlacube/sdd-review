# Validator metadata and JSON Schema / OpenAPI schema generation

## Summary

FluentValidation rules live only inside the .NET process. Teams that need the same contract
elsewhere — a front end that validates forms before submitting them, an OpenAPI document consumed
by client generators, contract tests that check payloads without calling the server — end up
re-typing the rules by hand (data annotations, hand-written JSON Schema, Swagger attributes), and
the copies drift from the validators.

The existing `IValidatorDescriptor` gives access to rules and validator instances, but not to their
parameters in a structured way: a tool has to know every validator class (`LengthValidator<T>`,
`GreaterThanValidator<T,TProperty>`, ...) and its properties, and parameters computed per instance
cannot be told apart from constants.

This request adds (1) structured metadata for every built-in property validator, (2) a rule-level
description view on the validator descriptor, and (3) a schema generator that turns a validator into
a JSON Schema (draft 2020-12) or OpenAPI 3.0/3.1 schema objects, with a dependency-injection helper.

## Proposed API

### Validator metadata (`FluentValidation.Validators`)

- `ValidatorMetadata`: a `Kind` (string), a read-only `Parameters` dictionary and a
  `HasDynamicParameters` flag; typed accessors `TryGetParameter<T>` / `GetParameter<T>`, a builder
  (`ValidatorMetadata.For(kind).With(name, value).Dynamic().Build()`) and a readable `ToString()`
  such as `Length(MaxLength=10, MinLength=1)`.
- `ValidatorKinds` and `ValidatorParameterNames`: constants for the built-in kinds and parameter names.
- `IValidatorMetadataProvider` with `ValidatorMetadata GetMetadata()`, implemented by
  `PropertyValidator<T,TProperty>` and `AsyncPropertyValidator<T,TProperty>` as a virtual method that
  returns `Custom` with the validator name; every built-in validator overrides it.
- `GetMetadata()` extension for any `IPropertyValidator`.

Metadata per built-in validator: `NotNull`, `Null`, `NotEmpty`, `Empty`, `Length`/`ExactLength`/
`MinimumLength`/`MaximumLength` (min/max length), the comparison validators (comparison, constant
value or compared member), `InclusiveBetween`/`ExclusiveBetween` (bounds, inclusiveness), regular
expressions (pattern and `RegexOptions`), email (mode), credit card, `IsInEnum` (enum type, flags,
names), `IsEnumName` (names, case sensitivity), `PrecisionScale` (precision, scale, trailing zeros),
`Must`/`MustAsync` (dynamic), child validators (validator type, instance when known, rule sets) and
the inheritance validator (derived types). Parameters computed from the instance are omitted and the
metadata is marked dynamic.

### Rule descriptions (`FluentValidation`)

- `ValidatorDescriptor<T>.DescribeRules()` returning `RuleDescription` objects: property name, display
  name, member, property type, value type (element type for `RuleForEach`), collection/include flags,
  rule sets (`IsInRuleSet`), whether the rule is conditional, dependent rules, and one
  `RuleComponentDescription` per validator (metadata, conditional flag, error code, unformatted
  message template).
- `DescribeRulesForMember(name | expression)` and `GetMetadataForMember(name)`.
- Extension methods on `IValidatorDescriptor`: `DescribeRules()`, `DescribeRules(ruleSets)` and
  `DescribeRulesForMember(name)`.

### Schema generation (`FluentValidation.Schema`)

- `JsonSchemaGenerator` with `Generate(validator)`, `Generate(validator, modelType)` and
  `GenerateForType(type)`, returning a `JsonSchemaResult` (`Schema` as `System.Text.Json.Nodes.JsonObject`,
  `Definitions`, `Diagnostics`, `ToJson()`).
- `JsonSchemaOptions`: dialect (`Draft202012`, `OpenApi30`, `OpenApi31`), rule sets, handling of
  conditional rules (ignore / apply / annotate), property naming policy, enum style (values / names),
  unvalidated properties, nullability of reference types, `$defs` reuse vs. inlining, display names as
  `title`, error messages as an extension keyword, title/id, maximum depth, a validator resolver for
  validators created per instance, and custom mappers.
- Extensibility: `IValidatorSchemaMapper` and a `ValidatorSchemaContext` with helpers that merge
  constraints; `options.MapKind(kind, ...)` and `options.MapValidator<TValidator>(...)` shortcuts.
- `OpenApiSchemaGenerator` producing `components/schemas` for several validators at once (or a minimal
  OpenAPI document), where a child validator that is also one of the given validators references its
  component.
- DI: `services.AddValidatorSchemas(configure)` registering an `IValidatorSchemaProvider` that builds
  schemas from the validators registered in the container.

## Behaviour

- Public readable properties are typed after their System.Text.Json representation (integers,
  numbers, strings with `date-time`/`date`/`time`/`uuid`/`uri` formats, base64 bytes, enums, arrays,
  string-keyed dictionaries, nested objects). `[JsonPropertyName]` and `[JsonIgnore]` are honoured.
- `NotNull`/`NotEmpty` make a property required and non-nullable; lengths, patterns, numeric bounds,
  constants, enums, `format: email`, precision/scale and nested objects map to the matching keywords.
  When several rules constrain the same property, the strictest bound wins.
- Rules that cannot be expressed (predicates, comparisons with other members, custom validators
  without a mapper, conditional rules by default) are reported as diagnostics with a JSON pointer,
  never silently dropped.
- Nested objects are stored once and referenced; recursive validators must not loop.
- .NET regex options that ECMA-262 lacks are handled where possible (case-insensitive patterns are
  rewritten), otherwise reported.

## Acceptance criteria

- Every built-in validator returns accurate metadata, including the dynamic flag for lambda-based
  parameters; existing behaviour of the validators is unchanged.
- `DescribeRules` covers rule sets, conditions, `RuleForEach`, `Include`, dependent rules and
  model-level rules.
- The generator produces valid draft 2020-12 output and OpenAPI 3.0/3.1 variants for the cases above,
  with diagnostics for everything left out.
- Custom validators can be described (override `GetMetadata()`) and mapped (`MapKind`, `MapValidator`,
  `IValidatorSchemaMapper`).
- Thorough xUnit tests; the existing test suite still passes; no new build warnings in Debug or
  Release (XML documentation).
- Documentation: a new docs page for schema generation, and updates to the custom validators, advanced,
  DI and ASP.NET pages, the table of contents and the changelog.
