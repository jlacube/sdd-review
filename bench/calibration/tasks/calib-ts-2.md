# Export validation metadata as JSON Schema

## Summary

Many projects keep two descriptions of the same payload: class-validator decorators on a DTO and a
hand-written JSON Schema (or OpenAPI component) for documentation, client generation or validation
in another language. The two drift. Third-party packages exist, but they rely on the internal
metadata layout and break between releases.

This issue proposes a supported way to generate a JSON Schema (draft 2020-12, which is also the
schema dialect of OpenAPI 3.1) from the validation metadata class-validator already stores.

## Proposed API

- `classToJsonSchema(target, options?)` returns the schema of one class.
- `classesToJsonSchemas(targets, options?)` returns a document with every class under `$defs`,
  so that classes referring to each other are emitted once.
- `@JsonSchema(partial)` property and class decorator that merges extra keywords (`description`,
  `examples`, `format`, ...) into the generated schema. It stores metadata only and takes no part
  in validation.
- `registerJsonSchemaConverter(constraintName, converter)` lets a custom decorator (built with
  `registerDecorator` or `ValidateBy`) contribute keywords; converters receive the validation
  metadata (constraints, `each`, groups) and return a partial schema.

Options:

- `groups` / `always` / `strictGroups`: select metadata exactly as `validate()` would with the same
  validator options;
- `additionalProperties`: `true` (default) or `false` (what `forbidNonWhitelisted` enforces);
- `refPointerPrefix` (default `#/$defs/`) and `definitions` (a resolver from property to nested
  class, because class-validator does not know the type behind `@ValidateNested`);
- `unknownConstraints`: `'ignore'` (default) or `'annotate'`, which records them under an
  `x-class-validator` keyword.

## Mapping

- Type checks: `IsString`, `IsNumber`, `IsInt`, `IsBoolean`, `IsArray`, `IsObject`, `IsDate`
  (string with `format: date-time`), `IsEnum` (`enum`), `IsIn` / `IsNotIn`, `Equals` (`const`).
- String: `MinLength`, `MaxLength`, `Length`, `Matches` (`pattern`), `IsEmail`, `IsUrl`, `IsUUID`,
  `IsIP`, `IsISO8601`, `IsDateString`, `IsHexColor`, `Contains`, `IsAlpha`, `IsAlphanumeric`, and
  the other string checks that have an exact JSON Schema equivalent.
- Numbers: `Min`, `Max`, `IsPositive`, `IsNegative`, `IsDivisibleBy` (`multipleOf`).
- Arrays: `ArrayMinSize`, `ArrayMaxSize`, `ArrayNotEmpty`, `ArrayUnique` (`uniqueItems`),
  `ArrayContains` (`allOf` of `contains`), and `each: true` on any of the above (keywords move into
  `items`).
- Presence: properties without `IsOptional` and without `ValidateIf` are `required`;
  `IsDefined` forces `required`; `IsOptional` adds `null` to the type.
- `ValidateNested` emits a `$ref` when a definition is known, otherwise `type: object`.
- Inherited metadata follows the same rules as validation.

## Expected behaviour

- The output is plain JSON (no functions, no `undefined`) and is deterministic: properties in
  declaration order, keywords in a stable order.
- Constraints that cannot be expressed are not silently turned into something stricter or looser.
- Schemas registered with `registerSchema` (the JSON validation schemas) can be exported too, by
  name.
- Nothing changes for code that does not call the new functions.

## Notes

- New code under `src/json-schema/`, exported from the index. Metadata access needed by the
  exporter should go through `MetadataStorage` methods rather than reaching into its private maps.
- Add a documentation page (`docs/advanced/json-schema.md` or similar), a README section and a
  sample under `sample/`.
- Tests: one spec per mapping group, agreement tests that check sample payloads accepted and
  rejected by class-validator against the generated keywords, and exact assertions on the output
  (no snapshots).
