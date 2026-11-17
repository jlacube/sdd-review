---
id: toolchain
artifact: toolchain
change: none
phase: init
status: draft
---

# Toolchain record

Probed with version checks only. The repository is greenfield: no tracked files and no commits, only `.sdd/`. No baseline survey and no `_living/CAP-*.md` stubs were written.

| Tool | Detected | Version | Path or endpoint | Fallback in use |
|---|---|---|---|---|
| node | yes | v22.13.0 | on PATH | none needed |
| git | yes | 2.45.1.windows.1 | on PATH | none needed |
| Claude Code | yes | 2.1.326 | on PATH (`claude`) | none needed |
| ripwire | no | - | `ripwire --version` failed: exit 127, command not found | serena → lsp → grep |
| Serena | yes | 1.7.0 | on PATH (`serena`); tools load as deferred MCP tools | none needed |
| ast-grep | yes | 0.42.3 | on PATH (`ast-grep`) | none needed |
| uv | yes | 0.13.6 | on PATH (`uv`) | none needed |
| Context7 | yes | - | https://mcp.context7.com/mcp | none needed (researcher probe: ok) |
| DeepWiki | yes | - | https://mcp.deepwiki.com/mcp | none needed (researcher probe: ok) |

## Notes

- Context7 and DeepWiki outcomes come from the researcher's probe, not from a call by the cartographer.
- Serena was detected by its version probe only. Its tools were not exercised, as the repository has no source files.
- ast-grep is detected: use `ast-grep run --pattern '<p>' --lang <l> <paths>` for syntactic shapes once code exists.
- Ripwire is absent, so questions go to Serena first, then LSP, then grep or glob.
- `git rev-parse HEAD` fails: the repository has no commit yet. Evidence entries will need a commit once one exists.
