import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// C001-T-012: the forbidden-HTML rule of C001-ADR-002 items 1 and 2 fails a component that uses
// dangerouslySetInnerHTML, and the other forbidden constructs.
const eslint = new ESLint({ cwd: process.cwd() });

async function messages(code: string, file = 'web/src/selftest/Sample.tsx') {
  const [result] = await eslint.lintText(code, { filePath: file });
  return result!.messages.filter((m) => m.severity === 2).map((m) => m.message);
}

describe('forbidden HTML rule', () => {
  it('fails the self-test component that uses dangerouslySetInnerHTML', async () => {
    const code = readFileSync('test/fixtures/lint-selftest/DangerousComponent.tsx', 'utf8');
    const found = await messages(code);
    expect(found.some((m) => m.includes('dangerouslySetInnerHTML'))).toBe(true);
  });

  it.each([
    ['innerHTML', 'export const f = (e: HTMLElement, s: string) => { e.innerHTML = s; };'],
    ['outerHTML', 'export const f = (e: HTMLElement, s: string) => { e.outerHTML = s; };'],
    [
      'insertAdjacentHTML',
      'export const f = (e: HTMLElement, s: string) => e.insertAdjacentHTML("beforeend", s);',
    ],
    [
      'bracket innerHTML',
      'export const f = (e: HTMLElement, s: string) => { e["innerHTML"] = s; };',
    ],
    ['createElement props', 'export const p = { dangerouslySetInnerHTML: { __html: "x" } };'],
    ['document.write', 'export const f = (s: string) => document.write(s);'],
    [
      'DOMParser',
      'export const f = (s: string) => new DOMParser().parseFromString(s, "text/html");',
    ],
    ['highlighter', 'import hljs from "highlight.js"; export default hljs;'],
    ['prism', 'import Prism from "prismjs"; export default Prism;'],
    ['styled-components', 'import styled from "styled-components"; export default styled;'],
    ['emotion', 'import { css } from "@emotion/react"; export default css;'],
    [
      'core import',
      'import { openCore } from "../../../src/core/api/open"; export default openCore;',
    ],
  ])('fails %s', async (_name, code) => {
    expect((await messages(code, 'web/src/selftest/Sample.ts')).length).toBeGreaterThan(0);
  });

  it('accepts a component that renders text', async () => {
    const code = 'export const A = (p: { t: string }) => <p>{p.t}</p>;';
    expect(await messages(code)).toEqual([]);
  });
});
