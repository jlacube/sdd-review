// Spike C001-T-014 (spike-grade, never shipped): the grammars of C001-ADR-003 decision 1, the
// file extensions they cover and a representative query set for symbol and import extraction.
import { createRequire } from 'node:module';

export type LanguageId = 'typescript' | 'tsx' | 'javascript' | 'python' | 'csharp';

export const LANGUAGE_IDS: readonly LanguageId[] = [
  'typescript',
  'tsx',
  'javascript',
  'python',
  'csharp',
];

/** C001-ADR-003 decision 1: which grammar parses which file. */
const EXTENSIONS: Record<string, LanguageId> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.cs': 'csharp',
};

/** The grammar of a path, or null for a file outside the deep ecosystems. */
export function languageOf(path: string): LanguageId | null {
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return EXTENSIONS[name.slice(dot).toLowerCase()] ?? null;
}

const WASM_FILES: Record<LanguageId, string> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
  csharp: 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm',
};

/** Absolute paths of the grammar WebAssembly files, from the pinned grammar packages. */
export function wasmPaths(): Record<LanguageId, string> {
  const require = createRequire(import.meta.url);
  const out = {} as Record<LanguageId, string>;
  for (const id of LANGUAGE_IDS) out[id] = require.resolve(WASM_FILES[id]);
  return out;
}

/**
 * Capture names: `name.<kind>` is the name of a symbol definition of that kind, `import` the
 * module a file imports, `ref` an identifier (a use or a definition; what name resolution of the
 * move and rename proofs walks). `_`-prefixed captures are helpers.
 */
const TS_COMMON = `
(function_declaration name: (identifier) @name.function)
(generator_function_declaration name: (identifier) @name.function)
(class_declaration name: (type_identifier) @name.class)
(abstract_class_declaration name: (type_identifier) @name.class)
(interface_declaration name: (type_identifier) @name.interface)
(type_alias_declaration name: (type_identifier) @name.type)
(enum_declaration name: (identifier) @name.enum)
(internal_module name: (identifier) @name.namespace)
(method_definition name: (property_identifier) @name.method)
(abstract_method_signature name: (property_identifier) @name.method)
(method_signature name: (property_identifier) @name.method)
(public_field_definition name: (property_identifier) @name.field)
(variable_declarator name: (identifier) @name.variable)
(import_statement source: (string (string_fragment) @import))
(export_statement source: (string (string_fragment) @import))
(call_expression
  function: (identifier) @_fn
  arguments: (arguments . (string (string_fragment) @import))
  (#eq? @_fn "require"))
(identifier) @ref
(type_identifier) @ref
(property_identifier) @ref
`;

export const QUERIES: Record<LanguageId, string> = {
  typescript: TS_COMMON,
  tsx: TS_COMMON,
  javascript: `
(function_declaration name: (identifier) @name.function)
(generator_function_declaration name: (identifier) @name.function)
(class_declaration name: (identifier) @name.class)
(method_definition name: (property_identifier) @name.method)
(field_definition property: (property_identifier) @name.field)
(variable_declarator name: (identifier) @name.variable)
(import_statement source: (string (string_fragment) @import))
(export_statement source: (string (string_fragment) @import))
(call_expression
  function: (identifier) @_fn
  arguments: (arguments . (string (string_fragment) @import))
  (#eq? @_fn "require"))
(identifier) @ref
(property_identifier) @ref
`,
  python: `
(function_definition name: (identifier) @name.function)
(class_definition name: (identifier) @name.class)
(assignment left: (identifier) @name.variable)
(import_statement name: (dotted_name) @import)
(import_statement name: (aliased_import name: (dotted_name) @import))
(import_from_statement module_name: (dotted_name) @import)
(import_from_statement module_name: (relative_import) @import)
(identifier) @ref
`,
  csharp: `
(class_declaration name: (identifier) @name.class)
(struct_declaration name: (identifier) @name.struct)
(interface_declaration name: (identifier) @name.interface)
(enum_declaration name: (identifier) @name.enum)
(record_declaration name: (identifier) @name.record)
(delegate_declaration name: (identifier) @name.delegate)
(method_declaration name: (identifier) @name.method)
(constructor_declaration name: (identifier) @name.constructor)
(property_declaration name: (identifier) @name.property)
(event_declaration name: (identifier) @name.event)
(field_declaration (variable_declaration (variable_declarator name: (identifier) @name.field)))
(namespace_declaration name: (_) @name.namespace)
(file_scoped_namespace_declaration name: (_) @name.namespace)
(using_directive (qualified_name) @import)
(using_directive (identifier) @import)
(identifier) @ref
`,
};
