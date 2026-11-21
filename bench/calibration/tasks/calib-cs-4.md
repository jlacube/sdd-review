# Rule set expressions: select rules with `!`, `&`, `|`, patterns and parentheses

## Summary

Rule sets can only be combined by listing names: `IncludeRuleSets("Create", "Admin")`
runs every rule that is in _any_ of the listed rule sets. Applications that use rule
sets as tags (a rule in `"Create, Admin"`, another in `"Create"`, a third in
`"Orders.Archive"`) cannot express common selections such as:

- the rules for creating a record, _except_ the ones only administrators see;
- the rules that are in both `Create` and `Strict`;
- every rule set of a feature area (`Orders.*`) plus the rules outside any rule set.

Today this needs a hand-written `IValidatorSelector`, which has to reimplement the
"default" rule set, the `*` wildcard, the handling of `Include()` and the bookkeeping
behind `ValidationResult.RuleSetsExecuted`.

This request adds a small boolean expression language over rule set names.

## Proposed API

```csharp
// ValidationStrategy<T>
validator.Validate(customer, o => o.IncludeRuleSetsMatching("Create & !Admin"));
validator.Validate(customer, o => o.IncludeRuleSetsMatching("default | Orders.*"));
validator.Validate(customer, o => o.IncludeRuleSetsMatching(RuleSetExpression.Named("Create") & !RuleSetExpression.Named("Admin")));
```

- `public abstract class RuleSetExpression` (namespace `FluentValidation`), immutable, with
  - `Parse(string)` (cached) and `TryParse(string, out RuleSetExpression, out string error)`;
  - factories `Named(name)`, `Pattern(glob)`, `AnyOf(params string[])`, and the static
    `Any` (`*`) and `Default` expressions;
  - `And`, `Or`, `Not` and the operators `&`, `|`, `!`;
  - `Matches(ruleSets)`, `GetReferencedRuleSets()`, `CanBeWrittenUnquoted(name)`;
  - structural, case-insensitive equality and a canonical `ToString()` that parses back to an
    equal expression.
- Public node types (name, pattern, any, not, and, or) so expressions can be inspected.
- `RuleSetExpressionException : ArgumentException` with `Reason`, `Expression` and the zero-based
  `Position` of the problem; its message shows the expression with a caret under the position.
- `RuleSetExpressionValidatorSelector : IValidatorSelector` (namespace `FluentValidation.Internal`).
- `ValidationStrategy<T>.IncludeRuleSetsMatching(string)` and `(RuleSetExpression)`.
- `ValidatorOptions.Global.ValidatorSelectors.RuleSetExpressionValidatorSelectorFactory`, like the
  existing selector factories (setting it to `null` restores the default).
- `SetValidator(childValidator, RuleSetExpression)` and `SetValidator(x => childValidator, RuleSetExpression)`
  rule-builder overloads to select the rules of one child validator
  (`ChildValidatorAdaptor.RuleSetExpression`).
- `ValidatorDescriptor<T>.GetRuleSetNames()` and `GetUnknownRuleSets(RuleSetExpression)` so that an
  application can detect a misspelt rule set name at startup.

## Syntax

| Syntax                         | Meaning                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `Create`                       | rules in the `Create` rule set (case-insensitive)                  |
| `default`                      | rules not declared in a rule set                                   |
| `*`                            | every rule                                                         |
| `Orders.*`, `Step?`            | rules in a rule set whose name matches the glob                    |
| `!A`, `not A`                  | rules not in A                                                     |
| `A & B`, `A && B`, `A and B`   | rules in both                                                      |
| `A \| B`, `A \|\| B`, `A or B` | rules in either                                                    |
| `A, B`                         | either, with the lowest precedence (the legacy comma syntax)       |
| `( … )`                        | grouping                                                           |
| `'two words'`, `"two words"`   | literal name (spaces, operators, `*`, `?`, keywords); `''` escapes |

Precedence: `!` > `&` > `|` > `,`. Nesting deeper than 64 levels is rejected.

## Behaviour

- A rule outside any rule set is evaluated as being in `default`.
- An `Include()` that is not itself inside a rule set always runs, and its rules are filtered by the
  same expression (as `RulesetValidatorSelector` does today). Child validators inherit the expression
  through the validation context unless `SetValidator` names its own.
- Combining `IncludeRuleSetsMatching` with `IncludeRuleSets`, `IncludeRulesNotInRuleSet`,
  `IncludeProperties` or another `IncludeRuleSetsMatching` runs a rule when any of them selects it,
  consistent with how the existing selectors are combined.
- `ValidationResult.RuleSetsExecuted` lists the rule sets that positively matched; a rule selected only
  through negation reports the rule sets it is declared in. When nothing matched, nothing is reported,
  as with `IncludeRuleSets` and an unknown name.
- An expression equivalent to a list of names (`"A | B"`, `"default"`, `"*"`) selects exactly the same
  rules and reports the same executed rule sets as `IncludeRuleSets`.
- No behaviour changes for code that does not use the new API.

## Acceptance criteria

- Parser, evaluation, selector, child validator, include, collection and async scenarios are covered by
  unit tests; existing tests keep passing.
- Syntax errors report the reason and the position (empty input, missing operand, missing or extra
  parenthesis, unterminated or empty quoted name, two names without an operator).
- `docs/rulesets.md` documents the syntax, and `Changelog.txt` has an entry.
- The solution builds on every target framework without new warnings.
