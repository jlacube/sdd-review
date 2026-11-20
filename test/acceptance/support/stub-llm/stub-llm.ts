import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const STUB_MODEL = 'stub-model-1';

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: unknown;
}

/** A scripted answer: the JSON object the model returns, or an HTTP status to fail with. */
export type ScriptedAnswer = { readonly output: unknown } | { readonly status: number };

/**
 * Loopback provider with scripted answers that records every request it receives
 * (C001-IF-010 §4 OpenAI-compatible chat and §5 Anthropic Messages).
 */
export class StubLlm {
  readonly requests: RecordedRequest[] = [];
  private readonly script: ScriptedAnswer[] = [];
  private server: Server | undefined;

  /** Queues the answer for the next request; with an empty queue the answer is `{}`. */
  enqueue(answer: ScriptedAnswer): this {
    this.script.push(answer);
    return this;
  }

  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(port, '127.0.0.1', resolve);
    });
    return this.endpoint;
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
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
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
    if ('status' in answer) {
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'scripted failure' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (path.endsWith('/chat/completions')) {
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
