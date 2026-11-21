import type { NamedFile, RecordedRun } from '../../generated/analysis-results.js';
import type { FileMentions, IdMentions } from './mentions.js';
import { blockText, fencedLines, fenceOf, headingOf, splitLines, textHash } from './text.js';

/**
 * Transcript passages and recorded runs (C001-IF-007 §9). Passages are the sources of
 * model-extracted intents (C001-REQ-315); recorded runs are the agent's commands with the output it
 * recorded, from which evidence bundles propose commands (C001-REQ-510). A command found here is
 * data: it never runs without the developer's confirmation (C001-CON-20, C001-REQ-511).
 */

type SourceFile = Pick<NamedFile, 'path' | 'format' | 'text'>;

/** A passage of a transcript (§9 item 1). */
export interface TranscriptPassage {
  readonly file: string;
  /** The file and the passage's first line. */
  readonly location: { readonly path: string; readonly line: number };
  /** The 1-based file line of the passage's last non-blank line. */
  readonly lastLine: number;
  readonly text: string;
  readonly textHash: string;
}

/** Info strings of the fenced blocks that hold shell sessions (§9 item 2), lower case. */
const SHELL_INFO = new Set([
  'console',
  'terminal',
  'shell-session',
  'sh',
  'bash',
  'zsh',
  'shell',
  'powershell',
  'pwsh',
  'ps1',
  'cmd',
  'bat',
]);
/** Info strings of the fenced block that holds the output of a prompt-less shell block. */
const OUTPUT_INFO = new Set(['', 'text', 'output']);

/**
 * Prompts (§9 item 2): `$ `, `> `, `PS> `, `PS <path>> ` and `<drive>:\<path>>`; the capture is the
 * command.
 */
const PROMPTS = [
  /^\$ (.*)$/,
  /^PS> (.*)$/,
  /^PS [^>]+> (.*)$/,
  /^[A-Za-z]:\\[^>]*>(.*)$/,
  /^> (.*)$/,
];
/** A comment line of a shell, PowerShell or cmd block. */
const COMMENT = /^(?:#|::|rem(?:\s|$))/i;
/** A plain-text command line (§9 item 2). */
const PLAIN_COMMAND = /^\$ (.*)$/;

const isBlank = (line: string) => line.trim() === '';
const linesOf = (file: SourceFile) => splitLines(file.text.replace(/\r\n?/g, '\n'));
/** Recorded output: the lines without leading and trailing blank lines; none when nothing is left. */
const outputOf = (lines: readonly string[]) => {
  const text = blockText(lines);
  return text === '' ? null : text;
};

/** The first word of an info string, in lower case. */
const infoWord = (info: string) => (/^\S*/.exec(info)![0] ?? '').toLowerCase();

/** The command of a prompt line, or `null` when the line has no prompt. */
function promptCommand(line: string): string | null {
  for (const prompt of PROMPTS) {
    const m = prompt.exec(line);
    if (m) return m[1]!.trim();
  }
  return null;
}

/** A fenced block: 0-based lines of its opening fence, first and last content lines, closing fence. */
interface FencedBlock {
  readonly info: string;
  readonly indent: number;
  readonly open: number;
  /** The line after the block: its closing fence plus one, or the end of the file when unclosed. */
  readonly after: number;
  readonly content: readonly string[];
}

function fencedBlocks(lines: readonly string[]): FencedBlock[] {
  const out: FencedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = fenceOf(lines[i]!);
    if (!fence) continue;
    let close = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const f = fenceOf(lines[j]!);
      if (f && f.char === fence.char && f.length >= fence.length && f.info === '') {
        close = j;
        break;
      }
    }
    const indent = /^ */.exec(lines[i]!)![0].length;
    // Content lines lose up to the fence's own indentation, as in CommonMark.
    const content = lines
      .slice(i + 1, close)
      .map((l) => l.replace(new RegExp(`^ {0,${indent}}`), ''));
    out.push({ info: infoWord(fence.info), indent, open: i, after: close + 1, content });
    i = close;
  }
  return out;
}

const run = (command: string, recordedOutput: string | null, path: string, line: number) =>
  ({ command, recordedOutput, location: { path, line }, intentIds: [] }) as RecordedRun;

/** The recorded runs of one shell block of a Markdown file. */
function blockRuns(
  block: FencedBlock,
  next: FencedBlock | undefined,
  lines: readonly string[],
  path: string,
): RecordedRun[] {
  const firstLine = block.open + 2; // 1-based line of the first content line
  const prompts = block.content.flatMap((line, k) => {
    const command = promptCommand(line);
    return command === null ? [] : [{ k, command }];
  });
  if (prompts.length > 0) {
    return prompts.flatMap(({ k, command }, p) => {
      if (command === '') return [];
      const end = prompts[p + 1]?.k ?? block.content.length;
      return [run(command, outputOf(block.content.slice(k + 1, end)), path, firstLine + k)];
    });
  }
  const commands = block.content.flatMap((line, k) => {
    const t = line.trim();
    return t === '' || COMMENT.test(t) ? [] : [{ k, command: t }];
  });
  // An output block follows with only blank lines between (§9 item 2).
  let output: string | null = null;
  if (next && OUTPUT_INFO.has(next.info)) {
    const between = lines.slice(Math.min(block.after, lines.length), next.open);
    if (between.every(isBlank)) output = outputOf(next.content);
  }
  return commands.map(({ k, command }, c) =>
    run(command, c === commands.length - 1 ? output : null, path, firstLine + k),
  );
}

/**
 * The recorded runs of an agent plan or transcript (§9 item 2), in file order. `intentIds` is empty
 * here: intake runs before the intents exist; the links of §9 item 3 are made by the intent map
 * (`runLiesIn`, `runMentions`).
 */
export function recordedRunsOf(file: SourceFile): RecordedRun[] {
  const lines = linesOf(file);
  if (file.format === 'markdown') {
    const blocks = fencedBlocks(lines);
    return blocks.flatMap((block, b) =>
      SHELL_INFO.has(block.info) ? blockRuns(block, blocks[b + 1], lines, file.path) : [],
    );
  }
  const out: RecordedRun[] = [];
  lines.forEach((line, i) => {
    const m = PLAIN_COMMAND.exec(line);
    if (!m) return;
    let end = i + 1;
    while (end < lines.length && !isBlank(lines[end]!) && !PLAIN_COMMAND.test(lines[end]!)) end++;
    out.push(run(m[1]!.trim(), outputOf(lines.slice(i + 1, end)), file.path, i + 1));
  });
  return out.filter((r) => r.command !== '');
}

/**
 * The passages of a transcript (§9 item 1): a Markdown transcript is split at its headings
 * (headings in fenced blocks do not count), a plain-text one at blank lines. Text before the first
 * heading is a passage of its own; a passage without any non-blank line is left out.
 */
export function transcriptPassages(file: SourceFile): TranscriptPassage[] {
  const lines = linesOf(file);
  const starts: number[] = [];
  if (file.format === 'markdown') {
    const fenced = fencedLines(lines);
    starts.push(0);
    lines.forEach((line, i) => {
      if (i > 0 && !fenced[i] && headingOf(line)) starts.push(i);
    });
  } else {
    lines.forEach((line, i) => {
      if (!isBlank(line) && (i === 0 || isBlank(lines[i - 1]!))) starts.push(i);
    });
  }
  return starts.flatMap((start, k) => {
    let end = (starts[k + 1] ?? lines.length) - 1;
    if (file.format !== 'markdown') {
      end = start;
      while (end + 1 < lines.length && !isBlank(lines[end + 1]!)) end++;
    }
    let first = start;
    while (first <= end && isBlank(lines[first]!)) first++;
    while (end >= first && isBlank(lines[end]!)) end--;
    if (first > end) return [];
    const text = lines.slice(first, end + 1).join('\n');
    return [
      {
        file: file.path,
        location: { path: file.path, line: first + 1 },
        lastLine: end + 1,
        text,
        textHash: textHash(text),
      },
    ];
  });
}

/** A source with a line extent: a plan item or a transcript passage. */
export interface LineExtent {
  readonly location: { readonly path: string; readonly line: number };
  readonly lastLine: number;
}

/** Whether a recorded run lies in a plan item or passage (§9 item 3, first case). */
export function runLiesIn(recorded: RecordedRun, source: LineExtent): boolean {
  const { path, line } = recorded.location;
  return path === source.location.path && line >= source.location.line && line <= source.lastLine;
}

/**
 * The spec items and changed files a recorded run's command or output names (§9 item 3, second
 * case; §10): the intent map links the run to the intents whose linked spec items or hunk files
 * are among them.
 */
export function runMentions(
  recorded: RecordedRun,
  ids: IdMentions,
  files: FileMentions,
): { readonly ids: string[]; readonly files: string[] } {
  const texts = [recorded.command, recorded.recordedOutput ?? ''];
  return {
    ids: [...new Set(texts.flatMap((t) => ids.names(t)))],
    files: [...new Set(texts.flatMap((t) => files.names(t)))].sort(),
  };
}
