# Problem details responses and serialization for validation results

## Summary

Almost every HTTP API that uses FluentValidation ends up writing the same glue code to turn a
`ValidationResult` into an error response. `ValidationResult.ToDictionary()` helps for the simplest
case (`Results.ValidationProblem(result.ToDictionary())`), but anything beyond that is left to each
application:

- property names are .NET member paths (`Orders[0].ProductName`), while the JSON the client sent uses
  camelCase (`orders[0].productName`), snake_case, or JSON Pointer (`/orders/0/productName`);
- error codes, severities and (sometimes) attempted values are lost, because the dictionary only
  carries messages, so clients cannot react to a specific failure without parsing translated text;
- warnings and info-level failures end up in 400 responses, or are filtered with ad-hoc LINQ;
- `ValidationException` thrown by `ValidateAndThrow` has to be mapped to a response by hand;
- serializing a `ValidationResult` with System.Text.Json writes the severity as a number and reads
  attempted values back as `JsonElement`.

This request adds first-class support for RFC 9457 (formerly RFC 7807) problem details built from
validation results, property-path naming policies, a formatter extension point and System.Text.Json
converters, without making the core package depend on ASP.NET.

## Proposed API

New namespace `FluentValidation.Results.Formatting`:

- `ValidationProblemDetails`: `Type`, `Title`, `Status`, `Detail`, `Instance`, `Errors`
  (`IDictionary<string, string[]>`, the ASP.NET Core shape), optional `ErrorDetails` (flat list of
  `ValidationErrorDetail` with property, message, code, severity, and opt-in attempted value and
  custom state) and `Extensions`. Defaults: the RFC 9110 "400 Bad Request" type URI, the title
  "One or more validation errors occurred." and status 400.
- `ValidationProblemDetailsBuilder`: fluent configuration (`WithType`, `WithTitle`, `WithStatus`,
  `WithDetail` (text or delegate), `WithInstance`, `WithExtension`, `UseNamingPolicy`, `WithLayout`,
  `OnlySeverities`, `ExcludeSeverities`, `MaxErrorsPerProperty`, `DistinctMessages`,
  `IncludeAttemptedValues`, `IncludeCustomState`) and `Build(ValidationResult | ValidationException |
IEnumerable<ValidationFailure>)`.
- `ProblemDetailsOptions`, with global defaults in `ValidatorOptions.Global.ProblemDetails`.
- `PropertyPath` / `PropertyPathSegment`: parse a failure's property name into member and indexer
  segments (numeric indexers, quoted dictionary keys, custom chain separator).
- `PropertyPathNamingPolicy`: `AsIs`, `CamelCase`, `SnakeCase`, `KebabCase`, `JsonPointer`,
  `JsonPointerWith(policy)`, `FromDelegate(...)`, and an abstract base for custom policies.
  Conversion is segment-wise; indexers are kept.
- `IValidationResultFormatter<out TOutput>` and `ValidationResultFormatter` factories
  (`ProblemDetails`, `Dictionary`, `List`, `Create(delegate)`).

Integration with existing types:

- `ValidationResult.ToDictionary(PropertyPathNamingPolicy)`, `ToProblemDetails()`,
  `ToProblemDetails(Action<ValidationProblemDetailsBuilder>)`, `Format(formatter)`.
- `ValidationFailure.GetPropertyPath()`, `GetPropertyName(policy)`.
- `ValidationException.ToProblemDetails()` and the configurable overload.
- `FluentValidation.DependencyInjectionExtensions`: `AddValidationProblemDetails(configure)` and
  `AddValidationResultFormatter<TOutput, TFormatter>()`.

New namespace `FluentValidation.Results.Formatting.Json` (System.Text.Json):

- `ValidationFailureJsonConverter`, `ValidationResultJsonConverter`,
  `ValidationProblemDetailsJsonConverter`, `AddFluentValidationConverters()` on
  `JsonSerializerOptions`, and `CreateProblemDetailsSerializerOptions()`.

## Behaviour

- Failures are grouped by converted property path in order of first occurrence; paths that become
  equal after conversion are merged. Failures without a property name use `ModelLevelKey` (empty by
  default).
- `MaxErrorsPerProperty` truncates per property and reports the number left out in an
  `omittedErrors` extension member; duplicates removed by `DistinctMessages` are not counted.
- Attempted values and custom state are never included unless enabled (they may contain personal
  data or secrets).
- Extension member names that clash with standard members (`type`, `title`, `status`, `detail`,
  `instance`, `errors`, `errorDetails`) are rejected.
- A builder works on a copy of its options; configuring a builder or formatter never changes the
  global defaults.
- Property-path parsing never throws: text that is not a well-formed path (for example a custom name
  with spaces) is kept as one segment.
- JSON: the problem details converter writes the RFC member names in lower case whatever the
  serializer naming policy, leaves out null standard members, writes extensions at the top level, and
  reads documents produced by ASP.NET Core (unknown members go to `Extensions`). The failure converter
  writes the severity by name, reads numbers and names, and reads attempted values back as
  primitives. Member matching on read is case-insensitive.
- Platform: System.Text.Json is in-box on .NET 5+, but a package on netstandard2.0/2.1. Decide whether
  the converters are compiled only for .NET 5+ or whether a package dependency is added, and justify
  the choice; the rest of the feature must work on every target framework.

## Acceptance criteria

- [ ] The API above exists, is documented with XML comments, and compiles on all target frameworks
      of the library without warnings (Debug and Release, warnings are errors).
- [ ] Unit tests cover path parsing, every naming policy, the builder options, the formatters, the
      integration methods on `ValidationResult`, `ValidationFailure` and `ValidationException`, the
      DI registration, and JSON round trips including documents written by ASP.NET Core, by the
      default serializer and by Newtonsoft.Json.
- [ ] Existing behaviour of `ToDictionary()` and default serialization is unchanged (a null property
      name no longer throwing in `ToDictionary()` is acceptable).
- [ ] Documentation: a new page for problem details, sections in the ASP.NET Core and error codes
      pages, the docs table of contents and the changelog.
- [ ] `dotnet test src/FluentValidation.Tests/FluentValidation.Tests.csproj -f net8.0` passes.
