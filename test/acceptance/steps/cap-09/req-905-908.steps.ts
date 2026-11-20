import { strict as assert } from 'node:assert';
import { request } from 'node:http';
import net from 'node:net';
import { After, Given, Then, When } from '@cucumber/cucumber';
import { startUiServer, type UiServer } from '../../../../src/ui-server/server.js';
import { FakeReview, hunkIdOf, intentIdOf } from '../../support/fake-review.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-905 to C001-TC-908 areas: C001-TS-907 (listening sockets), C001-TS-910 and C001-TS-911
// (host names) and C001-TS-914 (requests of another web origin).
//
// These scenarios run the real UI server (src/ui-server) over a real socket, with a stateful
// stand-in for the core API (support/fake-review.ts): the checks under test belong to the server,
// and the operations behind the routes are built by later tasks. What they do not cover is named
// next to each scenario; the security suite of C001-T-092 repeats them against the whole product
// (second host, socket listing of the CLI process, a browser).
//
// C001-TS-913 is bound in req-901-903.steps.ts (a browser). Not bound, with the reason: C001-TS-917
// opens views that C001-T-044 and later build; the web client has only the change list so far.

interface Session {
  server: UiServer;
  review: FakeReview;
  /** Servers the scenario's process made listen. */
  listeners: net.Server[];
  restore: () => void;
  lastReply?: Reply;
  attackerPage?: string;
  entriesAtStart?: number;
}

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly text: string;
}

const sessions = new WeakMap<AcceptanceWorld, Session>();

export function session(world: AcceptanceWorld): Session {
  const s = sessions.get(world);
  assert.ok(s, 'no review is open in the local review UI');
  return s;
}

/** Records every `net.Server` that starts listening while a scenario runs. */
function spyOnListening(): { listeners: net.Server[]; restore: () => void } {
  const listeners: net.Server[] = [];
  const original = net.Server.prototype.listen;
  net.Server.prototype.listen = function (this: net.Server, ...args: never[]) {
    listeners.push(this);
    return (original as (...a: unknown[]) => net.Server).apply(this, args);
  } as typeof net.Server.prototype.listen;
  return {
    listeners,
    restore: () => {
      net.Server.prototype.listen = original;
    },
  };
}

async function openReview(world: AcceptanceWorld): Promise<Session> {
  const spy = spyOnListening();
  const review = new FakeReview();
  try {
    const server = await startUiServer({ core: review.api(), snapshotId: `s-${'1'.repeat(64)}` });
    const s: Session = { server, review, listeners: spy.listeners, restore: spy.restore };
    sessions.set(world, s);
    return s;
  } catch (error) {
    spy.restore();
    throw error;
  }
}

After(async function (this: AcceptanceWorld) {
  const s = sessions.get(this);
  if (!s) return;
  s.restore();
  await s.server.close();
  sessions.delete(this);
});

function http(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, method, path, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    req.on('error', reject);
    req.end(payload);
  });
}

// C001-TS-907 — the sockets are listed in process: every `net.Server` this process made listen.
// The listing of the operating system's sockets of the CLI process is C001-T-092.

Given(
  'a review open in the local review UI with the default configuration',
  async function (this: AcceptanceWorld) {
    await openReview(this);
  },
);

When(
  "the listening sockets of the review assistant's processes are listed",
  function (this: AcceptanceWorld) {
    const s = session(this);
    assert.ok(s.listeners.length >= 1, 'the review assistant made no socket listen');
  },
);

Then('every listening socket is bound to 127.0.0.1 or ::1', function (this: AcceptanceWorld) {
  const s = session(this);
  for (const listener of s.listeners) {
    const address = listener.address();
    assert.ok(address && typeof address === 'object', 'a listening socket has no address');
    assert.ok(
      address.address === '127.0.0.1' || address.address === '::1',
      `a socket listens on ${address.address}`,
    );
  }
  assert.equal(s.server.address, '127.0.0.1');
});

// C001-TS-910 and C001-TS-911

Given(
  /^a review open in the local review UI on <port>, whose intent map holds intent "([^"]+)" and file "([^"]+)"$/,
  async function (this: AcceptanceWorld, intent: string, file: string) {
    const s = await openReview(this);
    s.review.addHunk(file, 1, 5, intent);
  },
);

Given('a review open in the local review UI on <port>', async function (this: AcceptanceWorld) {
  await openReview(this);
});

When(
  /^a request reaches 127\.0\.0\.1 on <port> naming the host "([^"]+)"$/,
  async function (this: AcceptanceWorld, host: string) {
    const s = session(this);
    const named = host.replace('<port>', String(s.server.port));
    // The token is sent too: the Host check must refuse before anything else is looked at.
    for (const path of ['/', '/api/v1/session', '/api/v1/intent-map']) {
      s.lastReply = await http(s.server.port, 'GET', path, {
        host: named,
        'x-review-token': s.server.token,
      });
      assert.equal(s.lastReply.status, 403, `${path} answered ${s.lastReply.status}`);
    }
  },
);

Then('the request is rejected', function (this: AcceptanceWorld) {
  const s = session(this);
  assert.equal(s.lastReply?.status, 403);
  assert.match(s.lastReply.text, /ERR-UI-001/);
});

Then(
  'the response holds no file path, hunk text or intent of the review',
  function (this: AcceptanceWorld) {
    const s = session(this);
    const text = JSON.stringify([s.lastReply?.text, s.lastReply?.headers]);
    for (const secret of ['REQ-012', 'src/coupon.ts', 'changed src', s.server.token]) {
      assert.ok(!text.includes(secret), `the response holds "${secret}"`);
    }
    assert.deepEqual(s.review.calls, [], 'review state was read');
  },
);

When(
  /^the developer's browser requests the review page naming the host "([^"]+)"$/,
  async function (this: AcceptanceWorld, host: string) {
    const s = session(this);
    s.lastReply = await http(s.server.port, 'GET', '/', {
      host: host.replace('<port>', String(s.server.port)),
    });
  },
);

Then('the response holds the review page', function (this: AcceptanceWorld) {
  const s = session(this);
  assert.equal(s.lastReply?.status, 200);
  assert.match(String(s.lastReply.headers['content-type']), /^text\/html/);
  assert.match(s.lastReply.text, /<html/i);
});

// C001-TS-914 — a page of another origin, with the token the page could not know, sent anyway:
// the Origin and Sec-Fetch-Site checks alone must refuse it.

Given(
  /^a review open in the local review UI on <port>, with a review record of (\d+) entries, and the developer's browser showing a page of "([^"]+)"$/,
  async function (this: AcceptanceWorld, entries: string, page: string) {
    const s = await openReview(this);
    s.review.entries = Number(entries);
    s.entriesAtStart = Number(entries);
    s.attackerPage = page;
  },
);

Given(
  /^intent "([^"]+)" has no verdict, holds the open hunk "([^"]+)" lines (\d+)-(\d+), and its evidence bundle holds the confirmed command `([^`]+)`, which creates the file "([^"]+)", and the proposed command `([^`]+)`, not confirmed$/,
  function (
    this: AcceptanceWorld,
    intent: string,
    file: string,
    from: string,
    to: string,
    confirmed: string,
    _created: string,
    proposed: string,
  ) {
    const s = session(this);
    s.review.addHunk(file, Number(from), Number(to), intent);
    s.review.addCommand(intentIdOf(intent), confirmed, true);
    s.review.addCommand(intentIdOf(intent), proposed, false);
  },
);

Given(
  /^intent "([^"]+)" holds (\d+) test hunks and the hunk "([^"]+)" lines (\d+)-(\d+), and has no test judgement$/,
  function (
    this: AcceptanceWorld,
    intent: string,
    tests: string,
    file: string,
    from: string,
    to: string,
  ) {
    const s = session(this);
    for (let i = 0; i < Number(tests); i++) s.review.addHunk(`test/t${i}.test.ts`, 1, 2, intent);
    s.review.addHunk(file, Number(from), Number(to), intent);
  },
);

Given(
  /^the unread sampled hunk "([^"]+)" lines (\d+)-(\d+) is cleared by the formatting rule, and the test run of the snapshot is running$/,
  function (this: AcceptanceWorld, file: string, from: string, to: string) {
    const s = session(this);
    s.review.addHunk(file, Number(from), Number(to), null, true);
    s.review.testRunRunning = true;
  },
);

/** Sends the request of one change as the page of another origin would, with the token. */
async function sendFromAttackerPage(world: AcceptanceWorld, change: string): Promise<void> {
  const s = session(world);
  const intent = (name: string) => intentIdOf(name);
  const hunk = (file: string, from: string, to: string) => hunkIdOf(file, Number(from), Number(to));
  let method = 'POST';
  let path: string;
  let body: unknown;
  let m: RegExpExecArray | null;
  if ((m = /^a sign verdict on "([^"]+)"$/.exec(change))) {
    path = `/api/v1/intents/${intent(m[1]!)}/verdicts`;
    body = { kind: 'sign' };
  } else if (
    (m = /^a read mark on (?:the sampled )?hunk "([^"]+)" lines (\d+)-(\d+)$/.exec(change))
  ) {
    path = '/api/v1/hunks/read';
    body = { hunkIds: [hunk(m[1]!, m[2]!, m[3]!)] };
  } else if ((m = /^a hunk move of "([^"]+)" lines (\d+)-(\d+) to "([^"]+)"$/.exec(change))) {
    path = `/api/v1/hunks/${hunk(m[1]!, m[2]!, m[3]!)}/move`;
    body = { target: { intentId: intent(m[4]!) } };
  } else if (
    (m = /^a defect report on the sampled hunk "([^"]+)" lines (\d+)-(\d+)$/.exec(change))
  ) {
    path = `/api/v1/hunks/${hunk(m[1]!, m[2]!, m[3]!)}/defect-reports`;
    body = { text: 'wrong' };
  } else if ((m = /^a test judgement "([^"]+)" on "([^"]+)"$/.exec(change))) {
    method = 'PUT';
    path = `/api/v1/intents/${intent(m[2]!)}/test-judgement`;
    body = { value: m[1] };
  } else if (
    (m = /^adding the command `([^`]+)` to the evidence bundle of "([^"]+)"$/.exec(change))
  ) {
    path = `/api/v1/intents/${intent(m[2]!)}/evidence-bundle/commands`;
    body = { command: m[1] };
  } else if ((m = /^confirming the proposed command `([^`]+)`$/.exec(change))) {
    const [owner, command] = [...s.review.bundles].flatMap(([name, list]) =>
      list.filter((c) => c.text === m![1]).map((c) => [name, c] as const),
    )[0] ?? [undefined, undefined];
    assert.ok(owner && command, 'the proposed command is not in a bundle');
    path = `/api/v1/intents/${owner}/evidence-bundle/commands/${command.id}/confirmation`;
  } else if ((m = /^running the evidence bundle of "([^"]+)"$/.exec(change))) {
    path = `/api/v1/intents/${intent(m[1]!)}/evidence-bundle/runs`;
  } else if (/^cancelling the running test run$/.test(change)) {
    path = '/api/v1/jobs/job-test-run/cancel';
  } else {
    assert.fail(`no request is defined for "${change}"`);
  }
  s.lastReply = await http(
    s.server.port,
    method,
    path,
    {
      host: `127.0.0.1:${s.server.port}`,
      'x-review-token': s.server.token,
      origin: s.attackerPage ?? 'https://attacker.test',
      'sec-fetch-site': 'cross-site',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body,
  );
}

When(
  /^that page sends a request for (.+) to 127\.0\.0\.1 on <port>$/,
  async function (this: AcceptanceWorld, change: string) {
    await sendFromAttackerPage(this, change);
  },
);

Then(
  /^the request is rejected with the error (ERR-UI-\d{3})$/,
  function (this: AcceptanceWorld, code: string) {
    const s = session(this);
    assert.equal(s.lastReply?.status, 403);
    assert.equal((JSON.parse(s.lastReply.text) as { code: string }).code, code);
    assert.deepEqual(s.review.calls, [], 'a core operation was called');
  },
);

Then(/^the review record still holds (\d+) entries$/, function (this: AcceptanceWorld, n: string) {
  assert.equal(session(this).review.entries, Number(n));
});

Then(/^"(REQ-\d+)" has no verdict$/, function (this: AcceptanceWorld, intent: string) {
  assert.equal(session(this).review.verdicts.has(intentIdOf(intent)), false);
});

Then(
  /^"([^"]+)" lines (\d+)-(\d+) is still an open hunk$/,
  function (this: AcceptanceWorld, file: string, from: string, to: string) {
    const hunk = session(this).review.hunk(file, Number(from), Number(to));
    assert.equal(hunk.read, false);
    assert.notEqual(hunk.intent, null);
  },
);

Then(
  /^"([^"]+)" lines (\d+)-(\d+) is still grouped under "([^"]+)"$/,
  function (this: AcceptanceWorld, file: string, from: string, to: string, intent: string) {
    assert.equal(session(this).review.hunk(file, Number(from), Number(to)).intent, intent);
  },
);

Then(
  /^"([^"]+)" lines (\d+)-(\d+) is still unread and in the reading queue$/,
  function (this: AcceptanceWorld, file: string, from: string, to: string) {
    const hunk = session(this).review.hunk(file, Number(from), Number(to));
    assert.equal(hunk.read, false);
    assert.equal(hunk.cleared, true);
  },
);

Then(
  'every hunk cleared by the formatting rule is still cleared',
  function (this: AcceptanceWorld) {
    const sampled = [...session(this).review.hunks.values()].filter((h) =>
      h.path.endsWith('format.ts'),
    );
    assert.ok(sampled.length > 0);
    for (const hunk of sampled) {
      assert.equal(hunk.cleared, true);
      assert.equal(hunk.defectReports, 0);
    }
  },
);

Then(/^"([^"]+)" has no test judgement$/, function (this: AcceptanceWorld, intent: string) {
  assert.equal(session(this).review.judgements.has(intentIdOf(intent)), false);
});

Then(
  /^the evidence bundle of "([^"]+)" does not list `([^`]+)`$/,
  function (this: AcceptanceWorld, intent: string, command: string) {
    const listed = session(this).review.bundles.get(intentIdOf(intent)) ?? [];
    assert.equal(
      listed.some((c) => c.text === command),
      false,
    );
  },
);

Then(/^`([^`]+)` is still not confirmed$/, function (this: AcceptanceWorld, command: string) {
  const all = [...session(this).review.bundles.values()].flat();
  const found = all.find((c) => c.text === command);
  assert.ok(found, 'the command is not in a bundle');
  assert.equal(found.confirmed, false);
});

Then(
  /^no command of the bundle has run and no file "([^"]+)" exists$/,
  function (this: AcceptanceWorld, _file: string) {
    const review = session(this).review;
    assert.equal(review.bundleRuns, 0);
    assert.equal(review.markerCreated, false);
  },
);

Then('the test run of the snapshot is still running', function (this: AcceptanceWorld) {
  assert.equal(session(this).review.testRunRunning, true);
});
