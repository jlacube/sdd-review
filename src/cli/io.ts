/** What a command needs from its process: output, working directory, environment, interruption. */
export interface CliIo {
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** Aborted by the interrupt signal (Ctrl+C); a command stops at its next step. */
  readonly signal: AbortSignal;
}
