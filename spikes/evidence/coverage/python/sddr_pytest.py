# Spike C001-T-020 (spike-grade, never shipped): pytest plugin of the Python coverage prototype,
# loaded through PYTEST_PLUGINS. It switches the coverage.py context to the test's node ID for
# each test, records each test's outcome and duration, and at the end writes
# <outDir>/python-<pid>.json: interpreter, tests, per-line contexts of the changed files, and the
# snapshot files loaded from outside the workspace (load monitor). C001-T-058 replaces it.
import json
import os
import sys

import pytest

import sitecustomize as _hook

_results = {}


@pytest.hookimpl(wrapper=True)
def pytest_runtest_protocol(item, nextitem):
    cov = _hook.COV
    if cov is not None:
        cov.switch_context(item.nodeid)
    try:
        return (yield)
    finally:
        if cov is not None:
            cov.switch_context("")


def pytest_runtest_logreport(report):
    rec = _results.setdefault(report.nodeid, {"outcome": "passed", "duration": 0.0})
    rec["duration"] += getattr(report, "duration", 0.0) or 0.0
    if report.failed:
        rec["outcome"] = "failed"
        rec["message"] = str(report.longrepr)[:2000]
    elif report.skipped and rec["outcome"] != "failed":
        rec["outcome"] = "skipped"


def _norm(p):
    p = os.path.abspath(p).replace("\\", "/")
    return p.lower() if os.name == "nt" else p


def _loaded_outside(cfg):
    roots = [_norm(r).rstrip("/") + "/" for r in cfg.get("outsideRoots", [])]
    snapshot = {
        (s.lower() if os.name == "nt" else s) for s in cfg.get("snapshotPaths", [])
    }
    out = set()
    for mod in list(sys.modules.values()):
        f = getattr(mod, "__file__", None)
        if not f:
            continue
        n = _norm(f)
        for r in roots:
            if n.startswith(r) and n[len(r) :] in snapshot:
                out.add(f)
    return sorted(out)


def pytest_unconfigure(config):
    cfg = _hook.CONFIG
    if cfg is None:
        return
    lines = {}
    cov = _hook.COV
    if cov is not None:
        try:
            cov.stop()
            cov.save()
            data = cov.get_data()
            for f in data.measured_files():
                by_line = data.contexts_by_lineno(f)
                lines[f] = {str(k): sorted(v) for k, v in by_line.items()}
        except Exception as e:  # noqa: BLE001 - spike: report and go on
            lines["<error>"] = {"0": [repr(e)]}
        _hook.COV = None
    out = {
        "interpreter": sys.executable,
        "tests": [{"nodeid": k, **v} for k, v in _results.items()],
        "lines": lines,
        "loadedOutside": _loaded_outside(cfg),
    }
    os.makedirs(cfg["outDir"], exist_ok=True)
    with open(
        os.path.join(cfg["outDir"], f"python-{os.getpid()}.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(out, f)
