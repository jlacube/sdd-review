import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const policyUrl = new URL('../licence-allowlist.json', import.meta.url);

export function loadPolicy(url = policyUrl) {
  const raw = JSON.parse(readFileSync(url, 'utf8'));
  return {
    osi: new Set(raw.osiPermissive),
    nonOsi: new Set(Object.keys(raw.permissiveNotOsiApproved ?? {})),
    forbidden: raw.forbiddenPatterns.map((p) => new RegExp(p, 'i')),
  };
}

/** Classify one SPDX identifier: 'osi', 'non-osi', 'forbidden' or 'unlisted'. */
export function classifyId(id, policy) {
  if (policy.forbidden.some((re) => re.test(id))) return 'forbidden';
  if (policy.osi.has(id)) return 'osi';
  if (policy.nonOsi.has(id)) return 'non-osi';
  return 'unlisted';
}

/**
 * Evaluate an SPDX expression ("A OR B", "A AND B", parentheses). OR passes when one side
 * passes, AND when both do. Returns { ok, worst, usedNonOsi } where worst is the first
 * failing classification.
 */
export function evaluate(expression, policy) {
  const tokens = String(expression)
    .replace(/[()]/g, (c) => ` ${c} `)
    .trim()
    .split(/\s+/);
  let pos = 0;
  const peek = () => tokens[pos];
  function parseAtom() {
    if (peek() === '(') {
      pos += 1;
      const r = parseOr();
      if (peek() === ')') pos += 1;
      return r;
    }
    const id = tokens[pos++];
    const cls = classifyId(id, policy);
    return { ok: cls === 'osi' || cls === 'non-osi', worst: cls, usedNonOsi: cls === 'non-osi' };
  }
  function parseAnd() {
    let left = parseAtom();
    while (peek() === 'AND') {
      pos += 1;
      const right = parseAtom();
      left = {
        ok: left.ok && right.ok,
        worst: left.ok ? right.worst : left.worst,
        usedNonOsi: left.usedNonOsi || right.usedNonOsi,
      };
    }
    return left;
  }
  function parseOr() {
    let left = parseAnd();
    while (peek() === 'OR') {
      pos += 1;
      const right = parseAnd();
      // Prefer an alternative that passes without a non-OSI licence.
      const pick = (a, b) => (a.ok && !a.usedNonOsi ? a : b.ok && !b.usedNonOsi ? b : a.ok ? a : b);
      left =
        left.ok || right.ok
          ? pick(left, right)
          : { ok: false, worst: left.worst, usedNonOsi: false };
    }
    return left;
  }
  const result = parseOr();
  // Unparsed trailing tokens (for example a legacy "MIT,Apache2" string) are not accepted.
  if (pos < tokens.length) return { ok: false, worst: 'unlisted', usedNonOsi: false };
  return result;
}

export function expressionOf(licences) {
  const list = Array.isArray(licences) ? licences : [licences];
  // A trailing "*" from licence-checker means "guessed from a file": not a declared licence.
  return list.map((l) => (/\*$/.test(String(l)) ? 'UNDECLARED' : String(l))).join(' AND ');
}

async function main() {
  const checker = await import('license-checker-rseidelsohn');
  const policy = loadPolicy();
  checker.init({ start: process.cwd(), production: false }, (err, packages) => {
    if (err) {
      console.error('licence-check: cannot read the dependency tree:', err.message);
      process.exit(2);
    }
    let forbidden = 0;
    let unlisted = 0;
    const nonOsi = [];
    for (const [name, p] of Object.entries(packages)) {
      const r = evaluate(expressionOf(p.licenses), policy);
      if (r.ok) {
        if (r.usedNonOsi) nonOsi.push(`${name} ${p.licenses}`);
      } else if (r.worst === 'forbidden') {
        forbidden += 1;
        console.error(`forbidden licence: ${name} ${p.licenses}`);
      } else {
        unlisted += 1;
        console.error(`licence not in licence-allowlist.json: ${name} ${p.licenses}`);
      }
    }
    for (const entry of nonOsi) console.warn(`note, permissive but not OSI-approved: ${entry}`);
    console.log(
      `licence-check: ${Object.keys(packages).length} packages, ${forbidden} forbidden, ` +
        `${unlisted} not in the allowlist, ${nonOsi.length} permissive but not OSI-approved`,
    );
    process.exit(forbidden + unlisted ? 1 : 0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
