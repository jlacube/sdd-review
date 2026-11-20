---
id: C001-T-059
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Per-test coverage adapter and load monitor for C#/.NET
milestone: C001-M-04
status: todo
depends_on: [C001-T-060]
implements: [C001-REQ-506]
satisfies_ac: [C001-AC-506.1]
verified_by: [C001-TS-516, C001-TS-517, C001-TS-584]
components: [C001-COMP-011]
risk_refs: [C001-RISK-016]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-059 — Per-test coverage adapter and load monitor for C#/.NET

## Intent
Record per-test line coverage of the changed C# files with AltCover instrumentation after build,
limited to the changed assemblies and source files, with call-context tracking on the test
attributes of xUnit, NUnit and MSTest, joined with VSTest TRX results by fully qualified name; and
report assemblies loaded from outside the workspace through a .NET startup hook (C001-ADR-007 §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `runtime/dotnet/sddr.targets › MSBuild targets` | chained through `CustomAfterMicrosoftCommonTargets`, AltCover step, TRX logger |
| add | `runtime/dotnet/StartupHook/StartupHook.csproj › load monitor` | `DOTNET_STARTUP_HOOKS` assembly, a class library with no NuGet dependency, target framework of the .NET line of `10-strategy.md` §4 (`net10.0` unless the report of C001-T-002 records another line), so it loads in that runtime and every later one |
| modify | `package.json › scripts.build:dotnet, scripts.build, files` | `build:dotnet` runs `dotnet build runtime/dotnet/StartupHook -c Release` with deterministic output into `runtime/dotnet/dist/`; `build` calls it; `files` includes `runtime/dotnet/dist/` and `runtime/dotnet/sddr.targets`; the built assembly is not committed (`.gitignore`) |
| add | `src/core/evidence/adapters/dotnet.ts › adapter configuration and result reading` | OpenCover report with tracked methods joined with TRX |
| add | `test/unit/evidence/adapters/dotnet/` | unit tests of C001-REQ-506 for this adapter: chaining of `CustomAfterMicrosoftCommonTargets` and `DOTNET_STARTUP_HOOKS` to developer values, OpenCover and TRX parsing, join by fully qualified name, line mapping, load-monitor record parsing (recorded report files, no `dotnet` process) |
| add | `test/fixtures/projects/dotnet-*/` | xUnit v2 and v3, NUnit, MSTest |

## Preconditions
- C001-T-060 done; AltCover licence confirmed by C001-T-002; Microsoft.Testing.Platform support
  state and the confirmed .NET line of `10-strategy.md` §4 recorded there.
- The .NET SDK of that line is installed wherever `npm run build` runs (developer machine, CI
  runners, the clean checkout of the publish procedure).

## Step outline
1. Build the targets file and the startup hook project; add `build:dotnet` to the build so CI, the
   publish procedure of `75-rollout.md` (step 3, from a clean checkout) and every developer build
   produce the assembly; inject both without replacing developer values. The C# code passes
   `npm run lint:cs` (`10-strategy.md` §4).
2. Instrument only the changed files' assemblies; read tracked methods per test.
3. Join with TRX outcomes; map lines.
4. Measure (a) on the C#/.NET benchmark change; narrow instrumentation if above 3.0.

## Verification
- `npm run build:dotnet`
- `npm run lint:cs`
- `npm pack --dry-run` (lists `runtime/dotnet/dist/` with the startup-hook assembly)
- `npm test -- test/unit/evidence/adapters/dotnet`
- `npm run acceptance -- --scenario C001-TS-516 --scenario C001-TS-517 --scenario C001-TS-584`
- `npm run bench -- workspace-w2 --ecosystem csharp`

## Done when
- [ ] Each supported test framework's fixture yields per-test line data and outcomes.
- [ ] (a) ≤ 3.0 on the C#/.NET benchmark change.
- [ ] The packed tarball holds the startup-hook assembly built from the clean checkout, and
      `npm run lint:cs` reports no error.
