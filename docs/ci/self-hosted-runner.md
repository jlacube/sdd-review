# Windows 11 self-hosted runner (`win11`)

The CI pipeline (`.github/workflows/ci.yml`) has one self-hosted leg: a Windows 11 x86-64 machine
registered as a repository-level GitHub Actions runner with the labels `self-hosted`, `Windows`,
`X64` and `win11` (C001-T-104, Q-ci-02). It runs the nightly suite (`schedule`, 02:00 UTC) and the
closing-commit suite (`workflow_dispatch`, and pushes of `v*` tags). The same machine is the
reference machine of `bench/README.md` and the Windows 11 host of E-LAN.

**Who keeps it online:** the repository owner (P-01), on whose PC the runner is installed.

## Safety rule (C001-RISK-020)

- The `win11` job has an `if:` that admits only `schedule`, `workflow_dispatch` and `v*` tag pushes.
  No `pull_request` job targets the label `win11`.
- Because the repository is public, a pull request from a fork could edit the workflow file itself.
  Keep **Settings › Actions › General › Fork pull request workflows from outside collaborators** at
  _Require approval for all outside collaborators_ (or stricter), and never approve a fork workflow
  run that changes `.github/workflows/`.
- The runner should run as a service under a local account without administrator rights, so a job
  cannot change the machine's configuration.

## Registration

1. Repository **Settings › Actions › Runners › New self-hosted runner**, Windows x64.
2. In `C:\actions-runner`, download and extract the runner as the page shows, then:
   `.\config.cmd --url https://github.com/<owner>/sdd-review --token <token> --name win11 --labels win11 --runasservice --windowslogonaccount "NT AUTHORITY\NETWORK SERVICE"`
   (or a dedicated local non-administrator account with `--windowslogonaccount .\<account> --windowslogonpassword <password>`).
3. Check the runner is listed as **Idle** in the settings page.

## Provisioning

The job installs Node.js 22, Python 3.12 and the .NET 10 SDK itself through the `setup-*` actions
(they download into the runner's tool cache). Installed on the machine:

| Tool                                          | Needed by                                           | How                                                                                       |
| --------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| git 2.45.1 first on `PATH`                    | every job                                           | Git for Windows installer                                                                 |
| other git versions (2.34.0, latest) beside it | git version tests (`SDD_GIT_234`, `SDD_GIT_LATEST`) | MinGit archives under `C:\tools\git\<version>`                                            |
| Microsoft Edge                                | browser scenarios                                   | preinstalled with Windows 11                                                              |
| Google Chrome, Mozilla Firefox                | browser matrix of C001-T-100                        | vendor installers (or `npx playwright install firefox`)                                   |
| Go, JDK 21 with Maven                         | fixtures outside the deep ecosystems                | `actions/setup-go`, `actions/setup-java` in the jobs that need them, or vendor installers |

## Updates and restart

- The runner application updates itself; after a Windows update check that the service is running
  (`Get-Service actions.runner.*`) and the runner is **Idle** in the settings page.
- To restart: `Restart-Service actions.runner.*` (service install) or stop and start `run.cmd`.
- A machine that is off makes the nightly `win11` job wait in the queue and then fail; restart it
  and re-run the job.
