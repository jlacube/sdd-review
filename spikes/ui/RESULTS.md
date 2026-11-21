# Spike C001-T-023: hunk list and file context response time

> **NOT YET MEASURED.** This file is the template for the results. The prototype and the runner
> are built. They were smoke-tested on a small synthetic change in Edge only. The scripted session
> has not been run on the benchmark change in any browser. Every value marked `—` below comes from
> `bench/results/ui-spike-<bench-id>-<browser>-<time>.md`, after the real runs on the idle
> reference machine. Nothing here is a result yet.

## Pass condition (fixed by the specification before the spike runs)

C001-NFR-003 applies, with no threshold changed. Over a scripted session of user actions, the time
from the input event to the updated view rendered, measured with browser performance marks:

- **p95 ≤ 200 ms** and **maximum ≤ 1 s**, per browser, over every action of the session.

Either value above its limit in one browser is a **miss** for that browser. C001-TC-005 runs the
spike on the largest benchmark change (`bench-ts`, 9,884 changed lines in 264 files) in the latest
major version of Chrome, Edge and Firefox. It is a spike, not the NFR evidence (that is C001-T-094).
C001-ADR-002 says what follows a miss: if p95 is above 200 ms after virtualisation, the UI stack
goes back to P-01, with SolidJS and Svelte as the alternatives presented (C001-T-024, DP-1).

## How to run the measurement

On the reference machine (`bench/README.md`), with nothing else running: close IDEs, other
browsers, agents and indexers, and keep the machine on mains power. The checkout
`../sdd-bench/ref/class-validator` must be at the head of `bench-ts` (`bench/bench-ts`,
`a1840cc7…`) and clean; the runner refuses it otherwise.

```
npm run build
npm run bench -- spike-ui
```

The second command is the same as `npm run bench -- spike-ui bench-ts --browser chrome,edge,firefox
--actions 500 --seed 23 --pause-ms 250`. It writes one
`bench/results/ui-spike-bench-ts-<browser>-<time>.json` and `.md` per browser and prints one line
per browser with the result. The exit code is 0 only when every browser passes.

- The first run takes in the change: `node dist/cli/main.js analyse --headless --base <base>` in
  the checkout, with the review store under `node_modules/.cache/sdd-ui-spike/store`. It then reads
  the file texts with `git cat-file --batch`. The result is cached in
  `node_modules/.cache/sdd-ui-spike/data/bench-ts.json`. To do this part beforehand, run
  `npm run bench -- spike-ui --prepare-only`. Delete the cache folder to take the change in again.
- The browsers run one after the other, **headed**: a window opens, so leave the machine alone.
  `--headless` exists for smoke tests; it is not the measured set-up.
- Options: `--browser <list>` (default `chrome,edge,firefox`), `--actions N` (default 500,
  minimum 200), `--seed N` (default 23), `--pause-ms N` (pause between actions, default 250),
  `--channel <kind>=<channel>` (for example `--channel edge=msedge-beta` or
  `--channel firefox=moz-firefox`, if this Playwright version supports a stock-Firefox channel),
  `all` or a list of benchmark change ids in place of the default largest change.
- Smoke test of the harness (not a result): `npm run bench -- spike-ui --synthetic 1000 --browser
edge --actions 200 --pause-ms 50 --headless`.

## What is measured

**Prototype** (`spikes/ui/app/`, built by Vite in production mode into
`node_modules/.cache/sdd-ui-spike/page`, served on 127.0.0.1 with the Content-Security-Policy of
C001-IF-002):

- Hunk list: one TanStack Virtual list (`@tanstack/react-virtual` 3.14.26) of every hunk of the
  intake document, grouped under up to 10 stand-in intent groups. The intake has no intents before
  C001-T-044, so each group is a leading directory: the nine largest, and "Other". The rows are a
  group header, a hunk header and each changed line (10,200 rows for `bench-ts`).
- File context: a second virtual list with the whole file of the open hunk on the head side (the
  base side for a deleted file). Added lines are marked, and the deleted lines of each hunk are
  shown in place. The largest file of `bench-ts` has 5,452 rows.
- All rows have one fixed height, are memoised (`React.memo`) and are rendered as React text nodes
  only. There is no inline script or style; positions are set through the CSSOM. The lint rules of
  the web client apply to `spikes/ui/app/`, and the runner records any CSP violation.

**Session** (`spikes/ui/session.ts`): 500 actions from a seeded generator, so every browser replays
the same sequence. About 35 % are open, 35 % scroll, 15 % mark and 15 % move. All are real
Playwright mouse or keyboard input:

| Type   | Input                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| open   | click on a hunk header in view (or key `j` when no header is in view), key `j` (next) or `k` (previous): the file context opens the file and scrolls to the hunk     |
| scroll | PageDown, PageUp, End or Home on the hunk list or on the file context. The scroll is instant (no smooth-scroll animation), and the virtualiser renders the new range |
| mark   | click on the toolbar's read-mark button for the open hunk: the hunk's rows and the toolbar's read count change                                                       |
| move   | a digit key moves the open hunk to that intent group: the hunk list is rebuilt and scrolled to the hunk                                                              |

**Timing** (`spikes/ui/app/timing.ts`): the start mark is set at the input event's `timeStamp`. The
action has settled in the first animation frame in which React has committed the action's state,
both lists have rows over their whole visible area at their scroll position, and the action's target
is in view (the opened hunk in both lists, the moved hunk in the list). The end mark is set in a
message task posted from that frame, which runs after the frame's paint. The measure is the time
between the two marks. An action that has not settled after 5 s is closed and counted as timed out,
which is a miss. p95 is the nearest-rank percentile, so it is always a measured value
(`spikes/ui/stats.ts`, unit-tested in `test/unit/spikes/ui-spike.test.ts`). Page load (navigation
to the first view) is reported without a threshold and is not an action.

## Browsers

Playwright 1.65.1 found these builds on 2026-11-21, in a launch check only (no session was run):

| Browser | How Playwright starts it                                   | Version found            |
| ------- | ---------------------------------------------------------- | ------------------------ |
| Chrome  | channel `chrome`: the installed Google Chrome              | 157.0.8103.80            |
| Edge    | channel `msedge`: the installed Microsoft Edge             | 158.0.4370.33            |
| Firefox | Playwright's own Firefox build (no channel), not Mozilla's | 159.0 (Playwright build) |

Each report records the exact version and user agent. Before measuring, check that the version
recorded for Chrome and Edge is the current stable major. Firefox is Playwright's patched build of
the version shown; a stock Mozilla release needs a channel that this Playwright supports, given
with `--channel firefox=…`.

## Results

Benchmark change `bench-ts`, 500 actions, seed 23, headed, viewport 1600x900.

| Browser | Version | p95 all (ms) | Max all (ms) | open p95 / max | scroll p95 / max | mark p95 / max | move p95 / max | Timed out | CSP violations | C001-NFR-003 |
| ------- | ------- | -----------: | -----------: | -------------- | ---------------- | -------------- | -------------- | --------: | -------------- | ------------ |
| Chrome  | —       |            — |            — | — / —          | — / —            | — / —          | — / —          |         — | —              | —            |
| Edge    | —       |            — |            — | — / —          | — / —            | — / —          | — / —          |         — | —              | —            |
| Firefox | —       |            — |            — | — / —          | — / —            | — / —          | — / —          |         — | —              | —            |

**Statement for C001-T-024:** — (pass or miss against C001-NFR-003, per browser, with the report
files.)

## Smoke check of the harness (not a result)

On 2026-11-21: synthetic change of 1,000 changed lines (27 files, 77 hunks, 1,085 hunk-list rows),
Edge 158.0.4370.33, 200 actions, 50 ms pause, on the development machine while it was in use.
Headless: p95 24.8 ms and maximum 148.8 ms (the first open, with a cold JIT). Headed: p95 22 ms and
maximum 51.1 ms. No CSP violations, no timed-out action. This only shows that the harness works.
The change is ten times smaller than `bench-ts`, so these numbers say nothing about the result.

## Limits of the spike

- No "decide" action: the prototype has no verdict view. C001-NFR-003's own session (C001-T-094)
  includes one.
- Stand-in intent groups by directory, not intents, so "move" changes the grouping but runs no
  intent-map logic.
- Scrolling is driven by the keyboard with instant scroll. Wheel scrolling with the browser's
  smooth-scroll animation is not timed, because the animation's length is a browser setting and
  not rendering work.
- The file texts are in the page's data from the start, so no API call is timed. In the product,
  opening a file may need a request to the UI server, which C001-T-094 measures.
- The reference machine is the Windows 11 PC that `bench/README.md` designates. E-REF in
  `60-test-plan.md` §3 names Ubuntu 24.04 with Linux browser builds.
