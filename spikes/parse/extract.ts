// Spike C001-T-014: the representative symbol and import extraction run on every parsed tree.
import { Language, Parser, Query, type Node, type Tree } from 'web-tree-sitter';
import { LANGUAGE_IDS, QUERIES, type LanguageId } from './languages.js';

export interface SymbolDef {
  readonly kind: string;
  readonly name: string;
  /** Zero-based row of the name. */
  readonly row: number;
}

export interface Extraction {
  readonly symbols: SymbolDef[];
  /** Imported module names, in source order, duplicates kept once. */
  readonly imports: string[];
  /** Number of identifier nodes (uses and definitions) the query visited. */
  readonly references: number;
  /** The tree holds an error or missing node: the file does not parse (C001-ADR-003 item 3). */
  readonly parseFailed: boolean;
}

/** One capture as the query returns it, reduced to what the summary needs. */
export interface CaptureLike {
  readonly name: string;
  readonly text: string;
  readonly row: number;
}

/** Folds the captures of one file into its extraction (pure; the part the unit tests pin). */
export function summarise(captures: Iterable<CaptureLike>, parseFailed: boolean): Extraction {
  const symbols: SymbolDef[] = [];
  const imports: string[] = [];
  const seenImports = new Set<string>();
  let references = 0;
  for (const c of captures) {
    if (c.name === 'ref') references++;
    else if (c.name === 'import') {
      if (!seenImports.has(c.text)) {
        seenImports.add(c.text);
        imports.push(c.text);
      }
    } else if (c.name.startsWith('name.')) {
      symbols.push({ kind: c.name.slice(5), name: c.text, row: c.row });
    }
  }
  return { symbols, imports, references, parseFailed };
}

/**
 * The grammars of one thread and their compiled queries. A grammar is loaded on its first use, so
 * a worker holds only the grammars of the files it was sent (a change in one ecosystem loads one
 * or two of the five).
 */
export class Grammars {
  private readonly languages = new Map<LanguageId, Language>();
  private readonly queries = new Map<LanguageId, Query>();
  private readonly loading = new Map<LanguageId, Promise<Language>>();

  private constructor(private readonly wasm: Record<LanguageId, string>) {}

  static async init(wasm: Record<LanguageId, string>): Promise<Grammars> {
    await Parser.init();
    return new Grammars(wasm);
  }

  /** Loads the grammar (once) and compiles its query. */
  ensure(id: LanguageId): Promise<Language> {
    let pending = this.loading.get(id);
    if (!pending) {
      pending = Language.load(this.wasm[id]).then((language) => {
        this.languages.set(id, language);
        this.queries.set(id, new Query(language, QUERIES[id]));
        return language;
      });
      this.loading.set(id, pending);
    }
    return pending;
  }

  /** Loads every grammar. */
  async ensureAll(): Promise<void> {
    for (const id of LANGUAGE_IDS) await this.ensure(id);
  }

  loaded(): LanguageId[] {
    return LANGUAGE_IDS.filter((id) => this.languages.has(id));
  }

  language(id: LanguageId): Language {
    const language = this.languages.get(id);
    if (!language) throw new Error(`grammar ${id} is not loaded`);
    return language;
  }

  extract(id: LanguageId, tree: Tree): Extraction {
    const query = this.queries.get(id);
    if (!query) throw new Error(`grammar ${id} is not loaded`);
    return extractFromNode(query, tree.rootNode);
  }

  delete(): void {
    for (const q of this.queries.values()) q.delete();
  }
}

export function extractFromNode(query: Query, root: Node): Extraction {
  const captures = query.captures(root);
  return summarise(
    captures.map((c) => ({
      name: c.name,
      // Only names and imports need their text; identifier uses are counted.
      text: c.name === 'ref' ? '' : c.node.text,
      row: c.node.startPosition.row,
    })),
    root.hasError,
  );
}

/** Parses one text with a parser that already holds the grammar; the caller deletes the tree. */
export function parseText(parser: Parser, language: Language, text: string): Tree {
  parser.setLanguage(language);
  const tree = parser.parse(text);
  if (!tree) throw new Error('tree-sitter returned no tree');
  return tree;
}
