import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const STUB_MODEL = 'stub-model-1';

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: unknown;
}

/**
 * A scripted answer: the JSON object the model returns, an HTTP status to fail with, a raw answer
 * body (malformed answers), or a connection closed before the status line. `delayMs` holds the
 * answer back (provider timeout); `hang` never answers.
 */
export type ScriptedAnswer = (
  | { readonly output: unknown }
  | { readonly status: number }
  | { readonly body: unknown; readonly status?: number }
  | { readonly destroy: true }
  | { readonly hang: true }
) & { readonly delayMs?: number };

/**
 * Loopback provider with scripted answers that records every request it receives
 * (C001-IF-010 §4 OpenAI-compatible chat and §5 Anthropic Messages). Listens on a free loopback
 * port (`start`) or on a local socket (`startOnSocket`: a Unix socket path, or a Windows pipe
 * `\\.\pipe\name`).
 */
export class StubLlm {
  readonly requests: RecordedRequest[] = [];
  private readonly script: ScriptedAnswer[] = [];
  /** Answers queued for the requests of one task (`enqueueFor`), before the common queue. */
  private readonly byTask = new Map<string, ScriptedAnswer[]>();
  /** The answer to every request that no queue answers (C001-TS-854: every request fails). */
  always: ScriptedAnswer | undefined;
  private server: Server | undefined;
  private readonly open = new Set<ServerResponse>();
  /**
   * Called once a request is recorded and before it is answered; the answer waits for it. The
   * client is then blocked on the answer, so a check here sees what it did before it sent the
   * request (C001-TS-822: the announcement precedes the first request).
   */
  onRequest: ((request: RecordedRequest) => void | Promise<void>) | undefined;
  /** The loopback address `start` listens on (C001-TS-816: 127.255.255.254, ::1). */
  private host = '127.0.0.1';

  /**
   * Queues the answer for the next request. With every queue empty and no `always` answer, the
   * answer is the empty output of the request's task (no intent, link or finding; the account
   * "Stub account." of the intent sent), or `{}` when the task is not known.
   */
  enqueue(answer: ScriptedAnswer): this {
    this.script.push(answer);
    return this;
  }

  /** Queues the answer for the next request of `task` (C001-IF-010 §2), e.g. `design-critique`. */
  enqueueFor(task: string, answer: ScriptedAnswer): this {
    const queue = this.byTask.get(task) ?? [];
    queue.push(answer);
    this.byTask.set(task, queue);
    return this;
  }

  /** The recorded requests of `task`. */
  requestsFor(task: string): RecordedRequest[] {
    return this.requests.filter((r) => taskOfBody(r.body) === task);
  }

  async start(port = 0, host = '127.0.0.1'): Promise<string> {
    this.host = host;
    await this.listen((server, done) => server.listen(port, host, done));
    return this.endpoint;
  }

  /** Listens on a local socket (C001-IF-010 §4: `unix:/path`, `npipe:name`). */
  async startOnSocket(socketPath: string): Promise<void> {
    await this.listen((server, done) => server.listen(socketPath, done));
  }

  private async listen(how: (server: Server, done: () => void) => void): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      how(this.server!, resolve);
    });
  }

  get port(): number {
    return (this.server?.address() as AddressInfo).port;
  }

  get endpoint(): string {
    return `http://${this.host.includes(':') ? `[${this.host}]` : this.host}:${this.port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    for (const res of this.open) res.destroy();
    this.open.clear();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      /* keep the raw text */
    }
    const path = req.url ?? '';
    const recorded = { method: req.method ?? '', path, headers: req.headers, body };
    this.requests.push(recorded);
    await this.onRequest?.(recorded);

    const task = taskOfBody(body);
    const answer = (task !== null ? this.byTask.get(task)?.shift() : undefined) ??
      this.script.shift() ??
      this.always ?? { output: emptyOutput(task, body) };
    if ('hang' in answer) {
      this.open.add(res);
      return;
    }
    if (answer.delayMs) {
      this.open.add(res);
      await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
      this.open.delete(res);
      if (res.destroyed) return;
    }
    if ('destroy' in answer) {
      res.socket?.destroy();
      return;
    }
    if ('body' in answer) {
      res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
      res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
      return;
    }
    if ('status' in answer) {
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'scripted failure' } }));
      return;
    }
    if (path.endsWith('/chat/completions')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          model: STUB_MODEL,
          choices: [
            {
              finish_reason: 'stop',
              message: { role: 'assistant', content: JSON.stringify(answer.output) },
            },
          ],
        }),
      );
    } else if (path.endsWith('/v1/messages')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          model: STUB_MODEL,
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'toolu_stub', name: 'submit_result', input: answer.output },
          ],
        }),
      );
    } else {
      res.writeHead(404);
      res.end('{}');
    }
  }
}

/** The task of a request body, from its system instruction (C001-IF-010 §3 item 1). */
export function taskOfBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { system?: unknown; messages?: Array<{ role?: string; content?: unknown }> };
  const system =
    typeof b.system === 'string' ? b.system : b.messages?.find((m) => m.role === 'system')?.content;
  return typeof system === 'string' ? (/Task "([a-z-]+)"/.exec(system)?.[1] ?? null) : null;
}

/** The input a request sends: its one user message, parsed (C001-IF-010 §3 item 2). */
export function inputOfBody(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null) return null;
  const messages = (body as { messages?: Array<{ role?: string; content?: unknown }> }).messages;
  const content = messages?.find((m) => m.role === 'user')?.content;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A valid output of `task` (C001-IF-011) that adds nothing. */
function emptyOutput(task: string | null, body: unknown): unknown {
  switch (task) {
    case 'intent-extraction':
      return { task, intents: [] };
    case 'hunk-linking':
      return { task, links: [] };
    case 'design-critique':
      return { task, findings: [] };
    case 'walkthrough-account': {
      const intent = inputOfBody(body)?.intent as { intentId?: unknown } | undefined;
      return { task, intentId: intent?.intentId, account: 'Stub account.' };
    }
    default:
      return {};
  }
}
