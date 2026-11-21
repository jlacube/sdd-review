import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Parser } from 'web-tree-sitter';
import { Grammars, parseText, summarise } from '../../../spikes/parse/extract.js';
import { languageOf, wasmPaths, type LanguageId } from '../../../spikes/parse/languages.js';

describe('parse spike: language of a path', () => {
  it('maps the extensions of C001-ADR-003 decision 1 and nothing else', () => {
    expect(languageOf('src/a.ts')).toBe('typescript');
    expect(languageOf('src/a.d.mts')).toBe('typescript');
    expect(languageOf('src/A.TSX')).toBe('tsx');
    expect(languageOf('lib/x.cjs')).toBe('javascript');
    expect(languageOf('pkg/m.pyi')).toBe('python');
    expect(languageOf('src/Rule.cs')).toBe('csharp');
    expect(languageOf('README.md')).toBeNull();
    expect(languageOf('dir.ts/Makefile')).toBeNull();
    expect(languageOf('.ts')).toBeNull();
  });
});

describe('parse spike: summarise', () => {
  it('folds captures into symbols, de-duplicated imports and a reference count', () => {
    const e = summarise(
      [
        { name: 'name.class', text: 'A', row: 0 },
        { name: 'ref', text: '', row: 0 },
        { name: 'import', text: 'x', row: 1 },
        { name: 'import', text: 'x', row: 2 },
        { name: '_fn', text: 'require', row: 2 },
        { name: 'ref', text: '', row: 3 },
      ],
      false,
    );
    expect(e).toEqual({
      symbols: [{ kind: 'class', name: 'A', row: 0 }],
      imports: ['x'],
      references: 2,
      parseFailed: false,
    });
  });
});

describe('parse spike: extraction on snippets with the WebAssembly grammars', () => {
  let grammars: Grammars;
  let parser: Parser;
  beforeAll(async () => {
    grammars = await Grammars.init(wasmPaths());
    await grammars.ensureAll();
    parser = new Parser();
  });
  afterAll(() => {
    parser?.delete();
    grammars?.delete();
  });

  const run = (id: LanguageId, text: string) => {
    const tree = parseText(parser, grammars.language(id), text);
    try {
      return grammars.extract(id, tree);
    } finally {
      tree.delete();
    }
  };
  const names = (e: ReturnType<typeof run>) => e.symbols.map((s) => `${s.kind}:${s.name}`).sort();

  it('TypeScript: declarations, imports, re-exports and require', () => {
    const e = run(
      'typescript',
      [
        "import { a } from './a';",
        "export * from './b';",
        "const fs = require('fs');",
        'export interface Shape { area(): number }',
        'type Id = string;',
        'enum Color { Red }',
        'export abstract class Base { abstract go(): void; x = 1; run() { return a; } }',
        'export function make(): Base { return null as never; }',
        'namespace NS { }',
      ].join('\n'),
    );
    expect(e.parseFailed).toBe(false);
    expect(e.imports).toEqual(['./a', './b', 'fs']);
    expect(names(e)).toEqual(
      [
        'class:Base',
        'enum:Color',
        'field:x',
        'function:make',
        'interface:Shape',
        'method:area',
        'method:go',
        'method:run',
        'namespace:NS',
        'type:Id',
        'variable:fs',
      ].sort(),
    );
    expect(e.references).toBeGreaterThan(10);
  });

  it('TSX parses JSX', () => {
    const e = run('tsx', "import React from 'react';\nexport const App = () => <div>{1}</div>;\n");
    expect(e.parseFailed).toBe(false);
    expect(e.imports).toEqual(['react']);
    expect(names(e)).toEqual(['variable:App']);
  });

  it('JavaScript: class, method, function, import', () => {
    const e = run(
      'javascript',
      "import x from 'x';\nclass K { y = 2; m() {} }\nfunction f() {}\nconst z = require('z');\n",
    );
    expect(e.imports).toEqual(['x', 'z']);
    expect(names(e)).toEqual(['class:K', 'field:y', 'function:f', 'method:m', 'variable:z']);
  });

  it('Python: definitions and the three import forms', () => {
    const e = run(
      'python',
      'import os\nimport numpy as np\nfrom . import sib\nfrom faker.providers import BaseProvider\n' +
        'X = 1\nclass P(BaseProvider):\n    def name(self):\n        return os.sep\n',
    );
    expect(e.parseFailed).toBe(false);
    expect(e.imports).toEqual(['os', 'numpy', '.', 'faker.providers']);
    expect(names(e)).toEqual(['class:P', 'function:name', 'variable:X']);
  });

  it('C#: type members, namespace and usings', () => {
    const e = run(
      'csharp',
      [
        'using System;',
        'using System.Linq;',
        'namespace FluentValidation.Rules;',
        'public record R(int A);',
        'public interface IV { void V(); }',
        'public class C : IV {',
        '  private int _f;',
        '  public string P { get; set; }',
        '  public C() {}',
        '  public void V() {}',
        '}',
      ].join('\n'),
    );
    expect(e.parseFailed).toBe(false);
    expect(e.imports).toEqual(['System', 'System.Linq']);
    expect(names(e)).toEqual(
      [
        'class:C',
        'constructor:C',
        'field:_f',
        'interface:IV',
        'method:V',
        'method:V',
        'namespace:FluentValidation.Rules',
        'property:P',
        'record:R',
      ].sort(),
    );
  });

  it('marks a file with a syntax error as not parsed', () => {
    expect(run('python', 'def broken(:\n  pass\n').parseFailed).toBe(true);
  });
});
