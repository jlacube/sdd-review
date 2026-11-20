---
id: C001-T-092
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Security suite — loopback only, cross-origin, DNS rebinding and CSP
milestone: C001-M-07
status: todo
depends_on: [C001-T-084, C001-T-011, C001-T-105]
implements: [C001-NFR-009, C001-NFR-010]
satisfies_ac: [C001-AC-905.1, C001-AC-906.1, C001-AC-907.1, C001-AC-908.1]
verified_by: [C001-TS-908, C001-TS-909, C001-TS-911, C001-TS-912, C001-TS-914, C001-TS-915, C001-TS-916, C001-TS-918, C001-TS-919]
components: [C001-COMP-018, C001-COMP-019]
risk_refs: [C001-RISK-022]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-092 — Security suite: loopback only, cross-origin, DNS rebinding and CSP

## Intent
Produce the evidence of C001-DOD-020 and C001-DOD-021: a socket check and a second-host connection
test on each operating system, and a cross-origin and DNS-rebinding test that sends every request
type of the review UI from another origin and through a host name resolving to 127.0.0.1, in each
supported browser, plus the CSP violation check over every view.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `test/security/sockets/ › listening-socket check, second-host test` | `npm run test:security -- sockets` on every runner kind of E-CI; `npm run test:security -- second-host --target <address>` run from the second host of E-LAN (`60-test-plan.md` §3): a container on a bridged Docker network for Ubuntu in CI; at release a second host on the same LAN as the Windows 11 runner `win11` (C001-T-104); once per release candidate the rented cloud Macs of Q-secondhost-01 (an EC2 mac1 dedicated host, x86-64, and an EC2 mac2 dedicated host, arm64, with a Linux instance in the same virtual network as the second host) |
| add | `docs/ci/cloud-mac-second-host.md` | runbook of the cloud-Mac run: account and region, allocation of the two Mac dedicated hosts, macOS 14 or later images, the Linux instance in the same subnet, the network rule that admits every port from the Linux instance to both Macs (so a refused connection comes from the review assistant, not from the network), installation of the release candidate from the dist-tag `next`, the run, the release of the hosts after the 24 h minimum, and the cost record |
| add | `bench/results/second-host-<version>.md` | per operating system and architecture of the machine under test: listening ports, attempts, accepted connections; for the cloud Macs also the instance types, image names and the cost of the run |
| add | `test/security/origin/ › cross-origin and rebinding suite` | generated from `openapi.yaml` so every request type is covered |
| add | `test/security/csp/ › CSP sweep` | every view under the policy |

## Preconditions
- C001-T-084 and C001-T-011 done; the release candidate of C001-T-105 published (the suite runs on
  its tag); the runner `win11` of C001-T-104 online.
- The macOS machines of E-LAN are rented cloud Macs (P-01's answer to Q-secondhost-01,
  `questions-log.md` Round 7; `60-test-plan.md` §3 E-LAN). The owner of this task holds a cloud
  account that can allocate an EC2 mac1 and an EC2 mac2 dedicated host in one region, and P-01 has
  provided that account and the budget for the 24 h minimum billing of each host per run
  (`10-strategy.md` §7). Without both, step 3 does not run on macOS and the owner reports C001-RISK-022.

## Step outline
1. Generate the request list from `openapi.yaml`; fail when a request type is missing.
2. Run the origin and rebinding suite in Chrome, Edge and Firefox (E-BR).
3. Run the socket check on every runner kind of E-CI and the second-host check per E-LAN: in CI on
   `ubuntu-24.04` from a container on a bridged Docker network; at release, from a second host on
   the same LAN as `win11`. Record the operating system, version and architecture of each machine
   under test.
4. Write `docs/ci/cloud-mac-second-host.md` and, once per release candidate, follow it: allocate
   the mac1 and mac2 dedicated hosts in one region and availability zone that offer both, start a
   macOS 14 or later instance on each and a Linux instance in the same subnet; install Node.js, git
   and the release candidate from the dist-tag `next` on both Macs; start a review in its default
   configuration on each Mac and run `npm run test:security -- second-host --target <address>` from
   the Linux instance against each Mac's private address. Record the results, instance types, image
   names and cost; terminate the instances and release the hosts as soon as the 24 h minimum ends.
   If a host type cannot be allocated in any region of the account, report C001-RISK-022.
5. Sweep every view for CSP violations.

## Verification
- `npm run test:security -- sockets`
- `npm run test:security -- origin`
- `npm run test:security -- second-host --target <address>` (from the second host, per machine of E-LAN)
- `npm run acceptance:browser -- --scenario C001-TS-908 --scenario C001-TS-909 --scenario C001-TS-911 --scenario C001-TS-912 --scenario C001-TS-914`
- `npm run acceptance:browser -- --scenario C001-TS-915 --scenario C001-TS-916 --scenario C001-TS-918 --scenario C001-TS-919`

## Done when
- [ ] 0 non-loopback listening sockets on each runner kind and 0 second-host connections on each
      machine of E-LAN (Ubuntu, Windows 11, macOS x86-64 on mac1, macOS arm64 on mac2), recorded
      in `bench/results/second-host-<version>.md` for the release candidate under test.
- [ ] `docs/ci/cloud-mac-second-host.md` exists; after the run both Mac dedicated hosts are
      released and the cost of the run is recorded.
- [ ] 0 accepted requests in the origin and rebinding suite in each browser.
