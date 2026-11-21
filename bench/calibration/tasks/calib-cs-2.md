# Validation diagnostics: listeners, execution traces, activities and metrics

## Summary

When a validator does not behave as expected (a rule that never fires, a ruleset that skips more
than intended, a slow nested validator), FluentValidation gives no way to see what actually ran.
The `ValidationResult` only lists failures: a rule skipped by a `When` condition, excluded by a
ruleset or cut short by a cascade stop leaves no trace, and there is nothing to hook into for
timing or for production monitoring. Applications instrumented with OpenTelemetry cannot see
validation inside their request traces at all.

This request adds a diagnostics layer to the core library, without changing validation results
and without any cost when it is not used.

## Proposed API

A new namespace, `FluentValidation.Diagnostics`.

### Listeners

```csharp
public interface IValidationListener {
  void OnValidatorStarting(ValidatorStartingEvent e);
  void OnRuleExecuted(RuleExecutedEvent e);
  void OnValidatorCompleted(ValidatorCompletedEvent e);
}
```

plus a `ValidationListenerBase` with no-op virtual methods and a `DelegateValidationListener`
that wraps lambdas.

- Global registration: `ValidatorOptions.Global.Diagnostics.AddListener(listener)` returns an
  `IDisposable` that removes it; also `RemoveListener` and `ClearListeners`.
- Per call: `validator.Validate(instance, o => o.AddListener(listener))` (a new
  `ValidationStrategy<T>.AddListener`).
- `ValidatorStartingEvent`: validator type, validated type, depth (0 for the root, 1+ for child
  validators), property path of a child validator, requested rulesets, rule count, sync/async.
  The validated instance only when `CaptureInstances` is enabled (off by default).
- `RuleExecutedEvent`: the rule, kind (`Property`, `Collection`, `Include`), property name and
  full path, outcome (`Passed`, `Failed`, `Skipped`), skip reason, number of failures, elapsed
  time, one entry per component invocation (validator name, outcome, elapsed, collection index),
  and for collection rules the number of elements validated and filtered out.
- `ValidatorCompletedEvent`: failures added by the validator (with counts per severity), elapsed
  time, executed and skipped rule counts, executed rulesets (root), the exception if it threw,
  whether `PreValidate` stopped it.
- Every event of one validation call shares an `OperationId`; validator and rule executions get
  an `ExecutionId` in start order and a `ParentExecutionId` linking child validators to the rule
  that started them and dependent rules to their parent rule.

Skip reasons: `NotSelected` (ruleset / `IncludeProperties`), `Condition`, `AsyncCondition`,
`ClassLevelCascade`, `NoComponentsToExecute` (collection rule whose components were all excluded).
Component outcomes: `Passed`, `Failed`, `SkippedByCondition`, `SkippedByAsyncCondition`,
`SkippedByCascade`.

### Execution traces

- `ValidationStrategy<T>.CaptureTrace()` records a `ValidationTrace` for the call;
  `result.GetTrace()` returns it (null when not requested); `validator.ValidateWithTrace(x, out
var trace)` as a shortcut.
- The trace is a tree: root validator, its rules, each rule's components, child validators and
  dependent rules; helpers `Validators()`, `Rules()`, `FindRule(path)`.
- `ValidationTraceTextFormatter` (indented text, options for timings, components and skipped
  rules, overridable write methods) and `ValidationTraceJsonWriter` (no JSON library dependency,
  so it works on every target).
- The trace must not be serialized with the `ValidationResult` and must survive `TestValidate`.

### Activities and metrics

- An `ActivitySource` and a `Meter`, both named `FluentValidation` (constants on a public
  `ValidationTelemetry` class, with the tag names).
- One `FluentValidation.Validate` activity per validator execution, a child of the current
  activity, tagged with validator, validated type, async, depth, rulesets, rule count, failure
  count, validity and executed/skipped rules; error status on exceptions (but not for the
  `ValidationException` of `ThrowOnFailures`). Optional per-rule activities
  (`EmitRuleActivities`, off by default).
- Metrics: validations counter, duration histogram (seconds), failures by severity (root only, so
  child failures are not counted twice) and a rules counter by outcome and skip reason.
- Only on .NET 6+ targets: the library must not take a new package dependency for
  netstandard2.0/2.1 and net5.0, where listeners and traces still work.

### Dependency injection

In `FluentValidation.DependencyInjectionExtensions`: `services.AddValidationListener<T>()`,
`services.AddValidationListener(instance)`, `services.AddValidationDiagnostics(configure)` and
`serviceProvider.UseValidationDiagnostics()`, which applies the configuration and attaches the
registered listeners; disposing the provider detaches them.

## Behaviour

- Pay-for-play: when no listener is registered, no trace requested and nobody listens to the
  activity source or meter, validators take the existing code path (one null check per rule).
- The root validator decides; child validators join the root's diagnostics scope and never start
  their own, including when the child validator is declared for a base type.
- A listener exception never changes the validation result; it is reported to an optional
  `ListenerError` callback.
- A rule whose `When`/`Unless` condition excluded all its components is reported as skipped,
  not passed.
- After an exception the context can be reused; the diagnostics state is not left attached.

## Acceptance criteria

- Listener, trace, formatter, activity, metric, options and DI behaviour covered by xUnit tests,
  plus diagnostics assertions alongside the existing ruleset, cascade, collection, condition,
  dependent rule, child rules, inheritance and test helper tests.
- Existing tests unchanged and passing; Debug and Release builds of the solution without warnings
  (`TreatWarningsAsErrors`, XML documentation in Release).
- Documentation page for diagnostics linked from the docs index, with pointers from the related
  pages, and a changelog entry.
- Benchmarks that compare validation with a listener or a trace attached against the default path.
