import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';

/**
 * Worker count and scheduling priority of mutation runs (C001-IF-013 §1 item 4, C001-ADR-006 §8):
 * at most one worker fewer than the machine's logical CPU cores and at least one, and processes
 * at a lower priority than the analysis core and the bundle commands: `nice` 10 on Linux and macOS
 * (plus the I/O class best-effort 7 on Linux), a Windows job object with the below-normal
 * priority class. The macOS background policy is not used (ADR-006 §8).
 *
 * The Windows job object also holds every process of an evidence command, whatever its priority,
 * so that cancellation ends the whole process tree (C001-IF-013 §1 item 3).
 */

export type RunPriority = 'normal' | 'low';

export const LOW_PRIORITY_NICE = 10;
/** Linux I/O scheduling class 2 (best-effort) at level 7, the lowest of that class. */
export const LINUX_IO_CLASS = { klass: 2, level: 7 } as const;

/** The worker count of the mutation tool: one logical core stays free for bundle runs. */
export function mutationWorkerCount(logicalCores: number = availableParallelism()): number {
  return Math.max(1, Math.floor(logicalCores) - 1);
}

/**
 * The script that `/bin/sh -c` runs for a low-priority command, which it receives as `$1`. The
 * shell lowers its own priority, then replaces itself by `/bin/sh -c "$1"` (same process, same
 * process group), so the command and every process it starts inherit the priority before the
 * command's first instruction. `nice` and `ionice` are standard utilities; without them the
 * command still runs, at the core's priority.
 */
export function lowPriorityPrelude(platform: NodeJS.Platform): string {
  const io =
    platform === 'linux'
      ? `ionice -c ${LINUX_IO_CLASS.klass} -n ${LINUX_IO_CLASS.level} -p $$ >/dev/null 2>&1; `
      : '';
  return (
    io +
    `if command -v nice >/dev/null 2>&1; then exec nice -n ${LOW_PRIORITY_NICE} /bin/sh -c "$1"; fi; ` +
    'exec /bin/sh -c "$1"'
  );
}

// ---------------------------------------------------------------------------------------------
// Windows job object

const JOB_OBJECT_LIMIT_PRIORITY_CLASS = 0x20;
const BELOW_NORMAL_PRIORITY_CLASS = 0x4000;
const JOB_OBJECT_BASIC_LIMIT_INFORMATION_CLASS = 2;
const PROCESS_TERMINATE = 0x0001;
const PROCESS_SET_QUOTA = 0x0100;

type Handle = unknown;

interface Kernel32 {
  createJob(): Handle | null;
  setBasicLimits(job: Handle, info: Record<string, number>): boolean;
  openProcess(pid: number): Handle | null;
  assign(job: Handle, process: Handle): boolean;
  terminate(job: Handle, exitCode: number): boolean;
  close(handle: Handle): void;
  lastError(): number;
}

let kernel32: Kernel32 | null | undefined;

/**
 * Binds the five kernel32 functions through koffi (MIT, docs/compliance N-01) on first use; null
 * when they cannot be bound (the runner then falls back to `taskkill /T` and the process priority
 * class).
 */
function bindKernel32(): Kernel32 | null {
  if (kernel32 !== undefined) return kernel32;
  try {
    const require = createRequire(import.meta.url);
    const koffi = require('koffi') as typeof import('koffi');
    const lib = koffi.load('kernel32.dll');
    // Anonymous, so that binding again in another module instance never meets a duplicate name.
    const basic = koffi.struct({
      PerProcessUserTimeLimit: 'int64',
      PerJobUserTimeLimit: 'int64',
      LimitFlags: 'uint32',
      MinimumWorkingSetSize: 'size_t',
      MaximumWorkingSetSize: 'size_t',
      ActiveProcessLimit: 'uint32',
      Affinity: 'uintptr_t',
      PriorityClass: 'uint32',
      SchedulingClass: 'uint32',
    });
    const create = lib.func('void * __stdcall CreateJobObjectW(void *attr, const char16_t *name)');
    const setInfo = lib.func('__stdcall', 'SetInformationJobObject', 'int', [
      'void *',
      'int',
      koffi.pointer(basic),
      'uint32_t',
    ]);
    const open = lib.func(
      'void * __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)',
    );
    const assign = lib.func('int __stdcall AssignProcessToJobObject(void *job, void *process)');
    const terminate = lib.func('int __stdcall TerminateJobObject(void *job, uint32_t code)');
    const close = lib.func('int __stdcall CloseHandle(void *handle)');
    const lastError = lib.func('uint32_t __stdcall GetLastError()');
    const size = koffi.sizeof(basic);
    kernel32 = {
      createJob: () => create(null, null) as Handle | null,
      setBasicLimits: (job, info) =>
        setInfo(job, JOB_OBJECT_BASIC_LIMIT_INFORMATION_CLASS, info, size) !== 0,
      openProcess: (pid) => open(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid) as Handle | null,
      assign: (job, process) => assign(job, process) !== 0,
      terminate: (job, code) => terminate(job, code) !== 0,
      close: (handle) => void close(handle),
      lastError: () => lastError() as number,
    };
  } catch {
    kernel32 = null;
  }
  return kernel32;
}

/** A job object holding the processes of one evidence command (Windows only). */
export class WindowsJob {
  private process: Handle | null = null;
  private closed = false;

  private constructor(
    private readonly api: Kernel32,
    private readonly job: Handle,
  ) {}

  /**
   * A new job; with `low`, every process in it runs in the below-normal priority class. Throws
   * when the job cannot be created or its limits set, with the Windows error code.
   */
  static create(low: boolean): WindowsJob {
    const api = bindKernel32();
    if (!api) throw new Error('kernel32 job-object functions are not available');
    const job = api.createJob();
    if (!job) throw new Error(`CreateJobObjectW failed (error ${api.lastError()})`);
    const created = new WindowsJob(api, job);
    if (low) {
      const ok = api.setBasicLimits(job, {
        PerProcessUserTimeLimit: 0,
        PerJobUserTimeLimit: 0,
        LimitFlags: JOB_OBJECT_LIMIT_PRIORITY_CLASS,
        MinimumWorkingSetSize: 0,
        MaximumWorkingSetSize: 0,
        ActiveProcessLimit: 0,
        Affinity: 0,
        PriorityClass: BELOW_NORMAL_PRIORITY_CLASS,
        SchedulingClass: 0,
      });
      if (!ok) {
        const code = api.lastError();
        created.close();
        throw new Error(`SetInformationJobObject failed (error ${code})`);
      }
    }
    return created;
  }

  /**
   * Puts the started process in the job; the processes it starts from then on are in the job
   * too (the job does not allow breakaway). Throws with the Windows error code.
   */
  assign(pid: number): void {
    const process = this.api.openProcess(pid);
    if (!process) throw new Error(`OpenProcess(${pid}) failed (error ${this.api.lastError()})`);
    this.process = process;
    if (!this.api.assign(this.job, process)) {
      throw new Error(`AssignProcessToJobObject failed (error ${this.api.lastError()})`);
    }
  }

  /** Ends every process in the job; false when Windows refuses. */
  terminate(): boolean {
    return !this.closed && this.api.terminate(this.job, 1);
  }

  /** Releases the handles; processes still in the job keep running. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.process) this.api.close(this.process);
    this.api.close(this.job);
  }
}
