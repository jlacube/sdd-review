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
  private server: Server | undefined;
  private readonly open = new Set<ServerResponse>();

  /** Queues the answer for the next request; with an empty queue the answer is `{}`. */
  enqueue(answer: ScriptedAnswer): this {
    this.script.push(answer);
    return this;
  }

  async start(port = 0): Promise<string> {
    await this.listen((server, done) => server.listen(port, '127.0.0.1', done));
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
    return `http://127.0.0.1:${this.port}`;
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
    this.requests.push({ method: req.method ?? '', path, headers: req.headers, body });

    const answer = this.script.shift() ?? { output: {} };
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
