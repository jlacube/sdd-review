/**
 * Reads the text of a review configuration file as JSON. The message of `JSON.parse` does not
 * always give a position (V8: `Unexpected token '}', "…" is not valid JSON`), so on failure a small
 * scanner finds the line of the first syntax error, which the notice names (C001-TS-480).
 */

export class JsonTextError extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {
    super(`JSON syntax error on line ${line}: ${reason}`);
    this.name = 'JsonTextError';
  }
}

/** Decodes UTF-8 (a leading byte-order mark is dropped) and parses; throws `JsonTextError`. */
export function parseJsonText(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new JsonTextError(1, 'the file is not UTF-8 text');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const found = locateSyntaxError(text);
    const reason = found?.reason ?? (error instanceof Error ? error.message : String(error));
    throw new JsonTextError(found ? lineOf(text, found.at) : lineOf(text, text.length), reason);
  }
}

function lineOf(text: string, at: number): number {
  let line = 1;
  for (let i = 0; i < at && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

class Stop {
  constructor(
    readonly at: number,
    readonly reason: string,
  ) {}
}

/** The offset and reason of the first JSON syntax error of the text, or `null` when it parses. */
export function locateSyntaxError(text: string): { at: number; reason: string } | null {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const fail = (reason: string): never => {
    throw new Stop(i, reason);
  };
  const describe = () => (i >= text.length ? 'end of file' : `"${text[i]}"`);

  const string = () => {
    i++; // opening quote
    for (;;) {
      if (i >= text.length) fail('unterminated string');
      const c = text[i]!;
      if (c === '"') {
        i++;
        return;
      }
      if (c === '\n' || c.charCodeAt(0) < 0x20) fail('control character in string');
      if (c === '\\') {
        const e = text[i + 1];
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail('invalid \\u escape');
          i += 6;
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) i += 2;
        else fail('invalid escape in string');
      } else i++;
    }
  };

  const value = (): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail(`expected a property name, found ${describe()}`);
        string();
        ws();
        if (text[i] !== ':') fail(`expected ":" after a property name, found ${describe()}`);
        i++;
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return;
        }
        fail(`expected "," or "}", found ${describe()}`);
      }
    } else if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return;
        }
        fail(`expected "," or "]", found ${describe()}`);
      }
    } else if (c === '"') string();
    else if (c !== undefined && /[-0-9]/.test(c)) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) fail('invalid number');
      i += m![0].length;
    } else {
      for (const literal of ['true', 'false', 'null']) {
        if (text.startsWith(literal, i)) {
          i += literal.length;
          return;
        }
      }
      fail(`unexpected ${describe()}`);
    }
  };

  try {
    value();
    ws();
    if (i < text.length) fail(`unexpected ${describe()} after the end of the document`);
    return null;
  } catch (stop) {
    if (stop instanceof Stop) return { at: stop.at, reason: stop.reason };
    throw stop;
  }
}
