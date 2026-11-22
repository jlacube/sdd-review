import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

/** One process of the process table: its resident memory in bytes. */
export interface ProcInfo {
  pid: number;
  ppid: number;
  rssBytes: number;
}

/** A way to read the process table of the machine, one implementation per operating system. */
export interface ProcessSource {
  readonly kind: string;
  snapshot(): Promise<ProcInfo[]>;
  /** Pid of a helper process the source runs, to leave out of a measured tree; else null. */
  readonly helperPid: number | null;
  close(): Promise<void>;
}

/** The processes of the trees below `rootPids` (roots included), each process once. */
export function treeMembers(table: readonly ProcInfo[], rootPids: readonly number[]): ProcInfo[] {
  const byParent = new Map<number, ProcInfo[]>();
  const byPid = new Map<number, ProcInfo>();
  for (const p of table) {
    byPid.set(p.pid, p);
    const siblings = byParent.get(p.ppid);
    if (siblings) siblings.push(p);
    else byParent.set(p.ppid, [p]);
  }
  const seen = new Set<number>();
  const members: ProcInfo[] = [];
  const stack = rootPids.filter((pid) => byPid.has(pid));
  while (stack.length > 0) {
    const pid = stack.pop() as number;
    if (seen.has(pid)) continue; // also stops a pid-reuse cycle
    seen.add(pid);
    const proc = byPid.get(pid);
    if (proc) members.push(proc);
    for (const child of byParent.get(pid) ?? []) stack.push(child.pid);
  }
  return members;
}

/** Parse `ps -A -o pid=,ppid=,rss=` (rss in KiB), the format of macOS and of Linux procps. */
export function parsePsOutput(text: string): ProcInfo[] {
  const procs: ProcInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), rssBytes: Number(m[3]) * 1024 });
  }
  return procs;
}

/** Parse the lines `pid ppid workingSetBytes` that the Windows helper prints. */
export function parseWindowsTable(text: string): ProcInfo[] {
  const procs: ProcInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d+) (\d+) (\d+)$/.exec(line.trim());
    if (m) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), rssBytes: Number(m[3]) });
  }
  return procs;
}

/** Parse `/proc/<pid>/status`: PPid and VmRSS (kB). Kernel threads have no VmRSS: 0 bytes. */
export function parseProcStatus(pid: number, text: string): ProcInfo | null {
  const ppid = /^PPid:\s*(\d+)/m.exec(text);
  if (!ppid) return null;
  const rss = /^VmRSS:\s*(\d+)\s*kB/m.exec(text);
  return { pid, ppid: Number(ppid[1]), rssBytes: rss ? Number(rss[1]) * 1024 : 0 };
}

function linuxSource(): ProcessSource {
  return {
    kind: 'linux-proc',
    helperPid: null,
    async snapshot() {
      const procs: ProcInfo[] = [];
      for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name)) continue;
        try {
          const info = parseProcStatus(Number(name), readFileSync(`/proc/${name}/status`, 'utf8'));
          if (info) procs.push(info);
        } catch {
          // the process ended between the listing and the read
        }
      }
      return procs;
    },
    async close() {},
  };
}

function psSource(): ProcessSource {
  return {
    kind: 'ps',
    helperPid: null,
    snapshot() {
      return new Promise((resolve, reject) => {
        execFile(
          'ps',
          ['-A', '-o', 'pid=,ppid=,rss='],
          { maxBuffer: 64 * 1024 * 1024 },
          (err, out) => (err ? reject(err) : resolve(parsePsOutput(out))),
        );
      });
    },
    async close() {},
  };
}

// A resident helper: Windows PowerShell starts slowly, so one instance answers every sample.
// It reads the table with a Toolhelp snapshot and the working set with GetProcessMemoryInfo.
const WINDOWS_HELPER = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ProcTable {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PROCESSENTRY32 {
    public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID;
    public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PMC {
    public uint cb; public uint PageFaultCount; public UIntPtr PeakWorkingSetSize; public UIntPtr WorkingSetSize;
    public UIntPtr QuotaPeakPagedPoolUsage; public UIntPtr QuotaPagedPoolUsage;
    public UIntPtr QuotaPeakNonPagedPoolUsage; public UIntPtr QuotaNonPagedPoolUsage;
    public UIntPtr PagefileUsage; public UIntPtr PeakPagefileUsage;
  }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32First(IntPtr h, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32Next(IntPtr h, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("psapi.dll")] static extern bool GetProcessMemoryInfo(IntPtr h, out PMC counters, uint size);
  public static string Snapshot() {
    StringBuilder sb = new StringBuilder();
    IntPtr snap = CreateToolhelp32Snapshot(2, 0);
    if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return "";
    PROCESSENTRY32 e = new PROCESSENTRY32();
    e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
    bool ok = Process32First(snap, ref e);
    while (ok) {
      ulong ws = 0;
      IntPtr h = OpenProcess(0x1000, false, e.th32ProcessID);
      if (h != IntPtr.Zero) {
        PMC c;
        if (GetProcessMemoryInfo(h, out c, (uint)Marshal.SizeOf(typeof(PMC)))) ws = (ulong)c.WorkingSetSize;
        CloseHandle(h);
      }
      sb.Append(e.th32ProcessID).Append(' ').Append(e.th32ParentProcessID).Append(' ').Append(ws).Append('\n');
      ok = Process32Next(snap, ref e);
    }
    CloseHandle(snap);
    return sb.ToString();
  }
}
"@
[Console]::Out.WriteLine('READY ' + $PID)
[Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  [Console]::Out.Write([ProcTable]::Snapshot())
  [Console]::Out.WriteLine('END')
  [Console]::Out.Flush()
}
`;

async function windowsSource(): Promise<ProcessSource> {
  const dir = mkdtempSync(path.join(tmpdir(), 'sdd-bench-ps-'));
  const script = path.join(dir, 'proctable.ps1');
  writeFileSync(script, WINDOWS_HELPER, 'utf8');
  const child: ChildProcessWithoutNullStreams = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  );
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  let buffer: string[] = [];
  let waiter: ((table: string) => void) | null = null;
  let onReady: ((pid: number) => void) | null = null;
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  lines.on('line', (line) => {
    if (line.startsWith('READY ')) onReady?.(Number(line.slice(6)));
    else if (line === 'END') {
      const table = buffer.join('\n');
      buffer = [];
      const w = waiter;
      waiter = null;
      w?.(table);
    } else buffer.push(line);
  });
  let helperPid: number;
  try {
    helperPid = await new Promise<number>((resolve, reject) => {
      onReady = resolve;
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`process-table helper exited (${code})`)));
      setTimeout(
        () => reject(new Error('process-table helper did not start in 60 s')),
        60_000,
      ).unref();
    });
  } catch (err) {
    child.kill();
    cleanup();
    throw err;
  }
  child.removeAllListeners('exit');
  child.on('error', () => undefined);
  let rejectPending: ((err: Error) => void) | null = null;
  let ended = false;
  child.on('exit', () => {
    ended = true;
    rejectPending?.(new Error('process-table helper ended'));
  });
  return {
    kind: 'windows-toolhelp',
    helperPid,
    snapshot() {
      return new Promise((resolve, reject) => {
        if (ended) return reject(new Error('process-table helper ended'));
        rejectPending = reject;
        waiter = (table) => resolve(parseWindowsTable(table));
        child.stdin.write('snap\n');
      });
    },
    async close() {
      child.stdin.end();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        const timer = setTimeout(() => {
          child.kill();
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      cleanup();
    },
  };
}

/** The process source of an operating system (`process.platform` values). */
export async function createProcessSource(
  platform: NodeJS.Platform = process.platform,
): Promise<ProcessSource> {
  if (platform === 'win32') return windowsSource();
  if (platform === 'linux') return linuxSource();
  if (platform === 'darwin') return psSource();
  throw new Error(`no process-table source for platform ${platform}`);
}

/** What a sampler recorded. Resident memory is the sum over the processes of the tree. */
export interface MemoryStats {
  source: string;
  intervalMs: number;
  sampleCount: number;
  peakResidentBytes: number;
  peakProcessCount: number;
  /** Milliseconds from the sampler's start to the sample that held the peak. */
  peakAtMs: number;
  meanGapMs: number;
  maxGapMs: number;
  /** [ms since start, resident bytes] per sample, thinned to at most `maxSeriesPoints`. */
  series: Array<[number, number]>;
}

export interface SamplerOptions {
  /** Roots of the measured tree; a function is read at every sample. */
  rootPids: number[] | (() => number[]);
  intervalMs?: number;
  source?: ProcessSource;
  /** Keep at most this many points of the series in the stats. */
  maxSeriesPoints?: number;
}

/** Samples the resident memory of a process tree every `intervalMs` (100 ms by default). */
export class MemorySampler {
  private readonly intervalMs: number;
  private readonly maxSeriesPoints: number;
  private source: ProcessSource | null;
  private readonly ownsSource: boolean;
  private readonly samples: Array<{ t: number; bytes: number; count: number }> = [];
  private t0 = 0;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(private readonly options: SamplerOptions) {
    this.intervalMs = options.intervalMs ?? 100;
    this.maxSeriesPoints = options.maxSeriesPoints ?? 2000;
    this.source = options.source ?? null;
    this.ownsSource = options.source === undefined;
  }

  async start(): Promise<void> {
    if (this.running) throw new Error('sampler already started');
    this.source ??= await createProcessSource();
    this.running = true;
    this.t0 = performance.now();
    await this.sampleOnce();
    this.schedule(1);
  }

  private schedule(n: number): void {
    if (!this.running) return;
    const due = this.t0 + n * this.intervalMs;
    const wait = Math.max(0, due - performance.now());
    this.timer = setTimeout(() => {
      this.inFlight = this.sampleOnce().then(() => {
        // Never queue samples up: when one was slow, skip the ticks it covered.
        const late = Math.ceil((performance.now() - this.t0) / this.intervalMs);
        this.schedule(Math.max(n + 1, late));
      });
    }, wait);
  }

  private async sampleOnce(): Promise<void> {
    const source = this.source;
    if (!source) return;
    try {
      const table = await source.snapshot();
      const roots =
        typeof this.options.rootPids === 'function'
          ? this.options.rootPids()
          : this.options.rootPids;
      const members = treeMembers(table, roots).filter((p) => p.pid !== source.helperPid);
      const bytes = members.reduce((sum, p) => sum + p.rssBytes, 0);
      this.samples.push({ t: performance.now() - this.t0, bytes, count: members.length });
    } catch {
      // a failed read leaves a gap, which the stats report
    }
  }

  async stop(): Promise<MemoryStats> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    await this.inFlight;
    await this.sampleOnce();
    if (this.ownsSource) await this.source?.close();
    return this.stats();
  }

  private stats(): MemoryStats {
    const s = this.samples;
    let peak = { t: 0, bytes: 0, count: 0 };
    for (const sample of s) if (sample.bytes >= peak.bytes) peak = sample;
    let maxGap = 0;
    let peakCount = 0;
    for (const sample of s) if (sample.count > peakCount) peakCount = sample.count;
    for (let i = 1; i < s.length; i++) maxGap = Math.max(maxGap, s[i].t - s[i - 1].t);
    const meanGap = s.length > 1 ? (s[s.length - 1].t - s[0].t) / (s.length - 1) : 0;
    const step = Math.max(1, Math.ceil(s.length / this.maxSeriesPoints));
    const series: Array<[number, number]> = [];
    for (let i = 0; i < s.length; i += step) series.push([Math.round(s[i].t), s[i].bytes]);
    return {
      source: this.source?.kind ?? 'none',
      intervalMs: this.intervalMs,
      sampleCount: s.length,
      peakResidentBytes: peak.bytes,
      // A loop, not Math.max(...): a multi-hour run has too many samples for a spread argument list.
      peakProcessCount: peakCount,
      peakAtMs: Math.round(peak.t),
      meanGapMs: Math.round(meanGap * 10) / 10,
      maxGapMs: Math.round(maxGap),
      series,
    };
  }
}
