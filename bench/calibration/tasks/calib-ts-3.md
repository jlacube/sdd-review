# Localised default validation messages

## Summary

Default messages are English strings built inside each decorator (`"$property must be an email"`).
Applications serving other languages have to pass a `message` to every single decorator or
post-process the error tree by matching English text. Several long-standing issues ask for a way
to plug in translated defaults.

This issue proposes message catalogues keyed by constraint name, selected per validation call.

## Proposed API

- `ValidatorOptions.locale?: string` selects the catalogue for one `validate()` call (BCP 47 tag,
  case-insensitive). Without it, messages are exactly what they are today.
- `ValidatorOptions.messages?: Partial<MessageCatalog>` overrides individual entries for one call.
- `registerLocale(locale, catalog)` / `unregisterLocale(locale)` / `getRegisteredLocales()` manage
  catalogues globally; `setDefaultLocale(locale)` changes the locale used when a call does not
  name one (default: none, meaning the decorators' own messages).
- A catalogue maps a constraint name (`isEmail`, `minLength`, `arrayMaxSize`, ...) to a template
  string or to a function `(args: ValidationArguments) => string`. Templates use the existing
  tokens (`$property`, `$value`, `$target`, `$constraint1` ...).
- An entry `"$each"` holds the prefix used for `each: true` constraints (English:
  `"each value in "`).

## Bundled catalogues

- `en`: exactly the current default messages of every built-in decorator.
- `de`, `fr`, `es`, `it`, `pt-BR`, `nl`, `pl`: complete translations of every built-in decorator.
- Fallback chain: `pt-BR` → `pt` → default locale → decorator's own message. A missing entry
  never produces an empty message.

## Expected behaviour

- A `message` given on the decorator always wins over any catalogue.
- `dismissDefaultMessages` still yields empty messages.
- Custom constraints (`ValidatorConstraint` classes and `registerDecorator`) can provide catalogue
  entries under their constraint name; if they do not, their `defaultMessage()` is used.
- Messages depending on constraints (for example `Length`, which says different things for a
  minimum, a maximum or both) are reproduced in every language.
- Validation of nested objects, arrays, maps and sets, async validation and `stopAtFirstError`
  use the same locale as the call.
- Concurrent `validate()` calls with different locales do not interfere.

## Notes

- Catalogues live in `src/i18n/locales/`; the resolution logic in `src/i18n/`. Message creation in
  the validation executor must go through one resolution function.
- A test must check that the `en` catalogue reproduces the message of every built-in decorator for
  representative constraint values, and that every bundled catalogue has the same keys as `en`.
- Document it in `docs/` and the README, with an example of registering a custom locale.
