/**
 * `npm run study -- g8-analyse`: the analysis of `60-test-plan.md` §6 item 10 (C001-T-109, run by
 * the owner of C001-T-102). Per method, the mean review time and the mean share of seeded defects
 * found over all counted sessions and per change; the C001-NFR-006 ratio, the C001-NFR-007
 * difference, the raters' agreement before discussion and the design items of C001-DOD-018.
 * Descriptive only (`nfr.md` §3 item 10).
 */
import { currentParticipant } from './g8-assign.js';
import {
  CAP_MINUTES,
  CHANGES,
  DEFECT_KINDS,
  METHODS,
  METHOD_NAMES,
  MIN_DEFECTS_PER_CHANGE,
  NFR_006_MAX_RATIO,
  NFR_007_MIN_DIFFERENCE_PP,
  OUTSIDE,
  ROW_COUNT,
  ROW_TABLE,
  type ChangeLabel,
  type Method,
} from './g8-model.js';
import { readRecord, sessionMinutes, type RecordData, type SessionEntry } from './g8-record.js';
import { cohenKappa, mean, percentAgreement, sampleStandardDeviation } from './g8-stats.js';

export interface CountedSession {
  id: string;
  row: number;
  participant: string;
  session: 1 | 2;
  change: ChangeLabel;
  method: Method;
  activeMinutes: number;
  countedMinutes: number;
  capped: boolean;
  findings: number;
  found: number;
  seeded: number;
  share: number;
  outside: number;
}

export interface MethodSummary {
  n: number;
  meanMinutes: number;
  sdMinutes: number | null;
  meanShare: number;
  sdShare: number | null;
}

export interface DesignItem {
  item: string;
  ok: boolean;
  detail: string;
}

export interface AnalysisResult {
  sessions: CountedSession[];
  excluded: { id: string; reason: string }[];
  perMethod: Record<Method, MethodSummary>;
  perChange: Record<ChangeLabel, Record<Method, MethodSummary>>;
  ratio: number | null;
  ratioMet: boolean | null;
  differencePp: number | null;
  differenceMet: boolean | null;
  agreement: { findings: number; agreed: number; percent: number | null; kappa: number | null };
  outsideFindings: { session: string; finding: string; description: string }[];
  design: DesignItem[];
  errors: string[];
  warnings: string[];
}

function summarise(list: CountedSession[]): MethodSummary {
  if (list.length === 0) {
    return { n: 0, meanMinutes: NaN, sdMinutes: null, meanShare: NaN, sdShare: null };
  }
  const minutes = list.map((s) => s.countedMinutes);
  const shares = list.map((s) => s.share);
  return {
    n: list.length,
    meanMinutes: mean(minutes),
    sdMinutes: sampleStandardDeviation(minutes),
    meanShare: mean(shares),
    sdShare: sampleStandardDeviation(shares),
  };
}

function lastSessionEnd(data: RecordData): number {
  let last = -Infinity;
  for (const s of data.sessions) {
    const t = s.log ? Date.parse(s.log.lastDecision) : NaN;
    if (!Number.isNaN(t)) last = Math.max(last, t);
  }
  return last;
}

export function analyseData(data: RecordData): AnalysisResult {
  const errors = [...data.problems];
  const warnings: string[] = [];
  const sessions: CountedSession[] = [];
  const excluded: AnalysisResult['excluded'] = [];
  const outsideFindings: AnalysisResult['outsideFindings'] = [];
  const raterA: string[] = [];
  const raterB: string[] = [];
  const raterDesign: string[] = [];
  const tutorialMissing: string[] = [];
  const tableMismatch: string[] = [];
  let completeRows = 0;

  const assignment = data.assignment;
  if (!assignment) errors.push('assignment.json is missing: no counted participant per row');

  const counted = new Set<string>();
  for (let row = 1; row <= ROW_COUNT; row++) {
    const participant = assignment ? currentParticipant(assignment, row) : null;
    let complete = 0;
    for (const planned of ROW_TABLE[row - 1]) {
      const entry: SessionEntry | undefined = data.sessions.find(
        (s) => s.row === row && s.participant === participant && s.session === planned.session,
      );
      const label = `row-${row}/${participant ?? '?'}-s${planned.session}`;
      if (!entry) {
        if (participant) errors.push(`${label}: no session folder`);
        continue;
      }
      counted.add(entry.id);
      errors.push(...entry.problems);
      const log = entry.log;
      if (!log) {
        errors.push(`${entry.id}: no log.json`);
        continue;
      }
      if (log.change !== planned.change || log.method !== planned.method) {
        tableMismatch.push(
          `${entry.id} logged ${log.change} with ${log.method}, the table says ${planned.change} with ${planned.method}`,
        );
      }
      if (log.method === 'assistant' && log.tutorialDone !== true) tutorialMissing.push(entry.id);
      const time = sessionMinutes(log);
      errors.push(...time.errors.map((e) => `${entry.id}: ${e}`));
      warnings.push(...time.warnings.map((w) => `${entry.id}: ${w}`));
      if (!entry.form) {
        errors.push(`${entry.id}: no form.md`);
        continue;
      }
      const sheets = data.ratings.get(entry.id) ?? {};
      const settled = sheets.settled;
      if (!settled) {
        errors.push(`${entry.id}: no settled rating sheet (rating/settled/)`);
        continue;
      }
      const seededList = data.seeded?.changes[log.change]?.defects;
      if (!seededList) {
        errors.push(`${entry.id}: the opened sealed list of change ${log.change} is not recorded`);
        continue;
      }
      const seededIds = new Set(seededList.map((d) => d.id));
      const formIds = entry.form.findings.map((f) => f.id);
      const matched = new Map(settled.matches.map((m) => [m.finding, m.defect]));
      let sheetOk = true;
      for (const id of formIds) {
        if (!matched.has(id)) {
          errors.push(`${entry.id}: finding ${id} has no label in the settled sheet`);
          sheetOk = false;
        }
      }
      for (const m of settled.matches) {
        if (!formIds.includes(m.finding)) {
          errors.push(`${entry.id}: settled sheet labels ${m.finding}, which is not in the form`);
          sheetOk = false;
        }
        if (m.defect !== OUTSIDE && !seededIds.has(m.defect)) {
          errors.push(`${entry.id}: ${m.defect} is not a seeded defect of change ${log.change}`);
          sheetOk = false;
        }
      }
      if (time.errors.length > 0 || !sheetOk) continue;

      const foundIds = new Set<string>();
      let outside = 0;
      for (const f of entry.form.findings) {
        const label = matched.get(f.id)!;
        if (label === OUTSIDE) {
          outside++;
          outsideFindings.push({ session: entry.id, finding: f.id, description: f.description });
        } else {
          foundIds.add(label);
        }
      }

      const r1 = sheets['rater-1'];
      const r2 = sheets['rater-2'];
      if (!r1 || !r2) {
        raterDesign.push(`${entry.id}: ${!r1 ? 'rater-1' : 'rater-2'} sheet missing`);
      } else {
        const l1 = new Map(r1.matches.map((m) => [m.finding, m.defect]));
        const l2 = new Map(r2.matches.map((m) => [m.finding, m.defect]));
        for (const id of formIds) {
          raterA.push(l1.get(id) ?? 'unrated');
          raterB.push(l2.get(id) ?? 'unrated');
        }
        const settledAt = Date.parse(settled.completedAt);
        if (!(Date.parse(r1.completedAt) <= settledAt && Date.parse(r2.completedAt) <= settledAt)) {
          raterDesign.push(`${entry.id}: a rater sheet is not completed before the settled sheet`);
        }
      }

      sessions.push({
        id: entry.id,
        row,
        participant: entry.participant,
        session: entry.session,
        change: log.change,
        method: log.method,
        activeMinutes: time.activeMinutes,
        countedMinutes: time.countedMinutes,
        capped: log.capped || time.activeMinutes > CAP_MINUTES,
        findings: formIds.length,
        found: foundIds.size,
        seeded: seededIds.size,
        share: foundIds.size / seededIds.size,
        outside,
      });
      complete++;
    }
    if (complete === 2) completeRows++;
  }

  for (const s of data.sessions) {
    if (counted.has(s.id)) continue;
    const rep = assignment?.replacements.find(
      (r) => r.row === s.row && r.dropped === s.participant,
    );
    excluded.push({
      id: s.id,
      reason: rep
        ? `participant ${s.participant} was replaced by reserve ${rep.reserve}; logged, not counted`
        : `participant ${s.participant} is not the counted participant of row ${s.row}`,
    });
  }

  const perMethod = {} as Record<Method, MethodSummary>;
  for (const m of METHODS) perMethod[m] = summarise(sessions.filter((s) => s.method === m));
  const perChange = {} as Record<ChangeLabel, Record<Method, MethodSummary>>;
  for (const c of CHANGES) {
    perChange[c] = {} as Record<Method, MethodSummary>;
    for (const m of METHODS) {
      perChange[c][m] = summarise(sessions.filter((s) => s.change === c && s.method === m));
    }
  }

  const haveBoth = perMethod.assistant.n > 0 && perMethod.diff.n > 0;
  const ratio = haveBoth ? perMethod.assistant.meanMinutes / perMethod.diff.meanMinutes : null;
  const differencePp = haveBoth
    ? (perMethod.assistant.meanShare - perMethod.diff.meanShare) * 100
    : null;

  // Design items of C001-DOD-018 and the protocol rules behind them.
  const design: DesignItem[] = [];
  design.push({
    item: '8 participants, each with two complete counted sessions (log, form, time, settled rating)',
    ok: completeRows === ROW_COUNT,
    detail: `${completeRows} of ${ROW_COUNT} rows complete`,
  });
  const balanceProblems = [...tableMismatch];
  for (const c of CHANGES) {
    for (const m of METHODS) {
      const n = sessions.filter((s) => s.change === c && s.method === m).length;
      if (n !== 2) balanceProblems.push(`change ${c} with ${m}: ${n} sessions, expected 2`);
    }
  }
  for (const m of METHODS) {
    const first = sessions.filter((s) => s.session === 1 && s.method === m).length;
    if (first !== 4) balanceProblems.push(`${m} first in ${first} rows, expected 4`);
  }
  design.push({
    item: 'Counterbalanced crossover: table of §6 item 5, each change twice per method, each method first four times',
    ok: balanceProblems.length === 0,
    detail: balanceProblems.length === 0 ? 'as designed' : balanceProblems.join('; '),
  });
  const lastEnd = lastSessionEnd(data);
  const sealProblems: string[] = [];
  for (const c of CHANGES) {
    const rec = data.seeded?.changes[c];
    if (!rec) {
      sealProblems.push(`change ${c}: no opened sealed list recorded`);
      continue;
    }
    const openedAt = Date.parse(rec.openedAt);
    if (Number.isNaN(openedAt) || !(openedAt > lastEnd)) {
      sealProblems.push(`change ${c}: opened ${rec.openedAt}, not after the last session ended`);
    }
  }
  design.push({
    item: 'Sealed defect lists opened after the last session ended',
    ok: sealProblems.length === 0,
    detail:
      sealProblems.length === 0
        ? `last session ended ${new Date(lastEnd).toISOString()}`
        : sealProblems.join('; '),
  });
  design.push({
    item: 'Two independent raters: both sheets for every counted session, completed before the settled sheet',
    ok: raterDesign.length === 0 && sessions.length > 0,
    detail:
      raterDesign.length === 0 ? `${sessions.length} sessions rated twice` : raterDesign.join('; '),
  });
  const seedProblems: string[] = [];
  for (const c of CHANGES) {
    const defects = data.seeded?.changes[c]?.defects ?? [];
    if (defects.length < MIN_DEFECTS_PER_CHANGE) {
      seedProblems.push(`change ${c}: ${defects.length} defects`);
    }
    const missing = DEFECT_KINDS.filter((k) => !defects.some((d) => d.kind === k));
    if (missing.length > 0) seedProblems.push(`change ${c}: no ${missing.join(', ')}`);
  }
  design.push({
    item: 'At least 8 seeded defects per change, at least one of each of the six kinds',
    ok: seedProblems.length === 0,
    detail: seedProblems.length === 0 ? 'met' : seedProblems.join('; '),
  });
  design.push({
    item: 'Tutorial on the practice change before every assistant session',
    ok: tutorialMissing.length === 0,
    detail:
      tutorialMissing.length === 0
        ? 'logged for every assistant session'
        : tutorialMissing.join(', '),
  });
  const rcs = new Set(
    data.sessions.filter((s) => counted.has(s.id) && s.log).map((s) => s.log!.rcVersion),
  );
  design.push({
    item: 'All counted sessions on one release candidate',
    ok: rcs.size === 1,
    detail: [...rcs].join(', ') || 'none recorded',
  });

  return {
    sessions,
    excluded,
    perMethod,
    perChange,
    ratio,
    ratioMet: ratio === null ? null : ratio <= NFR_006_MAX_RATIO,
    differencePp,
    differenceMet: differencePp === null ? null : differencePp >= NFR_007_MIN_DIFFERENCE_PP,
    agreement: {
      findings: raterA.length,
      agreed: raterA.filter((x, i) => x === raterB[i]).length,
      percent: raterA.length > 0 ? percentAgreement(raterA, raterB) : null,
      kappa: raterA.length > 0 ? cohenKappa(raterA, raterB) : null,
    },
    outsideFindings,
    design,
    errors,
    warnings,
  };
}

export function analyseRecord(root: string): AnalysisResult {
  return analyseData(readRecord(root));
}

const min = (v: number) => (Number.isNaN(v) ? '—' : v.toFixed(1));
const pct = (v: number | null) =>
  v === null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(1)} %`;
const sd = (v: number | null, f: (x: number) => string) => (v === null ? '—' : f(v));
const verdict = (met: boolean | null) => (met === null ? 'not computed' : met ? 'met' : 'missed');

/** `study/g8/RESULTS.md`. */
export function renderResults(
  r: AnalysisResult,
  meta: { input: string; generatedAt?: string },
): string {
  const complete = r.errors.length === 0 && r.design.every((d) => d.ok);
  const out: string[] = [];
  out.push('# G-8 comparison study — results');
  out.push('');
  out.push(
    `Generated by \`npm run study -- g8-analyse\` from \`${meta.input}\`` +
      (meta.generatedAt ? ` on ${meta.generatedAt}` : '') +
      '. Protocol: `60-test-plan.md` §6 of CHG-001; method: `10-spec/30-nfr/nfr.md` §3. ' +
      'Descriptive comparison; participants appear by code only. Do not edit by hand: rerun the command.',
  );
  out.push('');
  if (!complete) {
    out.push(
      '> **Incomplete record.** The record has errors or a design item is not met (below); ' +
        'these numbers are not the study result.',
    );
    out.push('');
  }
  out.push('## Result against the thresholds');
  out.push('');
  out.push('| NFR | Metric | Value | Threshold | Result |');
  out.push('|---|---|---|---|---|');
  out.push(
    `| C001-NFR-006 | mean review time with the review assistant / with the standard diff review | ${
      r.ratio === null ? '—' : r.ratio.toFixed(2)
    } | ≤ ${NFR_006_MAX_RATIO.toFixed(2)} | ${verdict(r.ratioMet)} |`,
  );
  out.push(
    `| C001-NFR-007 | mean share of seeded defects found, review assistant minus standard diff review | ${
      r.differencePp === null
        ? '—'
        : `${r.differencePp >= 0 ? '+' : ''}${r.differencePp.toFixed(1)} percentage points`
    } | ≥ ${NFR_007_MIN_DIFFERENCE_PP} percentage points | ${verdict(r.differenceMet)} |`,
  );
  out.push('');
  out.push(
    'A missed threshold is reported to P-01 with `sdd defect add --ref <NFR-ID>` with the per-change results; no threshold is changed (C001-T-102, C001-RISK-015).',
  );
  out.push('');
  out.push('## Per method, over all counted sessions');
  out.push('');
  out.push(
    '| Method | Sessions | Mean review time (min) | SD (min) | Mean share of seeded defects found | SD |',
  );
  out.push('|---|---|---|---|---|---|');
  for (const m of METHODS) {
    const s = r.perMethod[m];
    out.push(
      `| ${METHOD_NAMES[m]} | ${s.n} | ${min(s.meanMinutes)} | ${sd(s.sdMinutes, min)} | ${pct(s.meanShare)} | ${sd(s.sdShare, pct)} |`,
    );
  }
  out.push('');
  out.push(
    `Review time: opening to last decision, breaks subtracted; capped sessions count at ${CAP_MINUTES} minutes.`,
  );
  out.push('');
  out.push('## Per change');
  out.push('');
  out.push('| Change | Method | Sessions | Mean review time (min) | Mean share found |');
  out.push('|---|---|---|---|---|');
  for (const c of CHANGES) {
    for (const m of METHODS) {
      const s = r.perChange[c][m];
      out.push(
        `| ${c} | ${METHOD_NAMES[m]} | ${s.n} | ${min(s.meanMinutes)} | ${pct(s.meanShare)} |`,
      );
    }
  }
  out.push('');
  out.push('## Sessions');
  out.push('');
  out.push(
    '| Session | Change | Method | Active (min) | Counted (min) | Capped | Findings | Seeded found | Outside the list |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of [...r.sessions].sort((a, b) => a.row - b.row || a.session - b.session)) {
    out.push(
      `| ${s.id} | ${s.change} | ${METHOD_NAMES[s.method]} | ${min(s.activeMinutes)} | ${min(s.countedMinutes)} | ${
        s.capped ? 'yes' : 'no'
      } | ${s.findings} | ${s.found} of ${s.seeded} (${pct(s.share)}) | ${s.outside} |`,
    );
  }
  out.push('');
  if (r.excluded.length > 0) {
    out.push('Logged and not counted (`60-test-plan.md` §6 item 4):');
    out.push('');
    for (const e of r.excluded) out.push(`- ${e.id}: ${e.reason}`);
    out.push('');
  }
  out.push("## Raters' agreement before discussion");
  out.push('');
  out.push(
    `Over ${r.agreement.findings} findings of the counted sessions, the two raters gave the same label (a seeded defect ID or "outside") to ${r.agreement.agreed}: ${pct(r.agreement.percent)}; Cohen's kappa ${
      r.agreement.kappa === null ? '—' : r.agreement.kappa.toFixed(3)
    }. Disagreements were settled by discussion; the counts above use the settled sheets.`,
  );
  out.push('');
  out.push('## Findings outside the sealed lists (logged, not counted)');
  out.push('');
  if (r.outsideFindings.length === 0) out.push('None.');
  for (const f of r.outsideFindings) out.push(`- ${f.session} ${f.finding}: ${f.description}`);
  out.push('');
  out.push('## Design items (C001-DOD-018)');
  out.push('');
  out.push('| Item | Result | Detail |');
  out.push('|---|---|---|');
  for (const d of r.design) out.push(`| ${d.item} | ${d.ok ? 'yes' : 'NO'} | ${d.detail} |`);
  out.push('');
  if (r.errors.length > 0 || r.warnings.length > 0) {
    out.push('## Record problems');
    out.push('');
    for (const e of r.errors) out.push(`- error: ${e}`);
    for (const w of r.warnings) out.push(`- warning: ${w}`);
    out.push('');
  }
  return out.join('\n');
}
