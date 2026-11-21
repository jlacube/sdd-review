# Structured output formats for validation errors

## Summary

`validate()` returns a tree of `ValidationError` objects: each error has a `property`, a
`constraints` map and `children` for nested objects and arrays. That shape is faithful but awkward
to hand to a client. Almost every application that exposes class-validator results over HTTP
writes its own recursive walk to turn the tree into something flat (`{ "address.street": [...] }`),
and the only built-in rendering, `ValidationError.toString()`, is a console-oriented string.

This issue proposes a small set of built-in formatters for the error tree, so that the common
shapes are available, tested and consistent.

## Proposed API

All functions take the array returned by `validate()` / `validateSync()` (or a single
`ValidationError`) and never mutate it.

- `flattenValidationErrors(errors, options?)` returns one entry per failed constraint:
  `{ path, property, constraint, message, value?, context? }`.
  - `options.pathStyle`: `'dot'` (default, `address.street`, `tags[0].name`) or `'pointer'`
    (RFC 6901 JSON Pointer, `/address/street`, `/tags/0/name`, with `~0` / `~1` escaping).
  - `options.includeValue` / `options.includeContext` (both default `false`).
  - Keys of `Map` and `Set` children (which class-validator reports as the property name) appear as
    `[key]` in dot paths and as a path segment in pointers.
- `groupErrorsByPath(errors, options?)` returns `Record<string, string[]>` mapping each path to
  its messages, in the order the constraints were reported.
- `toProblemDetails(errors, options?)` returns an RFC 9457 problem details object
  (`type`, `title`, `status`, `detail`, `instance`) with an `errors` extension member holding the
  flattened entries in pointer style. Defaults: `type: 'about:blank'`, `title: 'Validation failed'`,
  `status: 400`; `detail` counts the failed constraints.
- `formatErrorTree(errors, options?)` renders the tree as indented plain text, one line per
  property and one line per message, with `options.indent` (default two spaces) and
  `options.showValues`.

## Expected behaviour

- An empty array yields `[]`, `{}`, a problem details object with an empty `errors` array, and an
  empty string respectively.
- Errors on the root object (for example from `forbidUnknownValues`, where the error has no
  property path) use path `''` in both styles (in pointer style `''` is the whole document).
- Errors produced with `validationError: { target: false, value: false }` still format; `value` is
  then simply absent.
- `ValidationError.toString()` keeps its current output exactly; its path-building logic is shared
  with the new formatters instead of being duplicated.

## Notes

- Put the formatters in their own folder under `src/` and export them from the package index.
- Document them in a new page under `docs/basics/`, link it from `docs/README.md`, and add a short
  section to the README.
- Add spec files for each formatter, including nested objects, arrays, maps, sets, `each`
  constraints, inherited and conditional validation, and errors coming from async constraints.
