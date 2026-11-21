# Spike C001-T-020 (spike-grade, never shipped): the Python hook of C001-ADR-006 §6 reduced to what
# the measurements need. It is put first on PYTHONPATH from <evidence root>/runtime/spike-evidence/
# python and reads the run configuration named by SDDR_RUN (in <workspace>.aux/).
#
# - Per-test coverage (C001-ADR-007 §2, Python row): starts coverage.py in every Python process with
#   `include` limited to the changed files, forcing the ctrace core (licence report S-12, D-009:
#   the sys.monitoring core drops contexts set through the context API). The coverage.py of the
#   environment is used when present, else the vendored copy named by the configuration is put at
#   the end of sys.path. The pytest plugin `sddr_pytest` switches the context per test.
# - Mutation (C001-ADR-007 §3): with SDDR_MUTANT=<path>::<k>, the engine `sddr_mutate` applies
#   mutant k to the one module at <path> at import time; no file is written.
#
# Not prototyped (C001-T-058 does them): the path hook and meta-path wrapper that redirect imports
# from the working tree to the workspace (the benchmark's flat layout loads from the workspace
# already), chaining to an existing sitecustomize, the unittest wrapper.
import atexit
import json
import os
import sys

COV = None
CONFIG = None


def _main():
    global COV, CONFIG
    run = os.environ.get("SDDR_RUN")
    if not run:
        return
    try:
        with open(run, encoding="utf-8") as f:
            CONFIG = json.load(f)
    except OSError:
        return
    mutant = os.environ.get("SDDR_MUTANT")
    if mutant:
        import sddr_mutate

        sddr_mutate.install(CONFIG, mutant)
    if not CONFIG.get("coverage"):
        return
    os.environ["COVERAGE_CORE"] = "ctrace"
    try:
        import coverage
    except ImportError:
        vendor = CONFIG.get("vendor")
        if not vendor:
            return
        sys.path.append(vendor)
        import coverage
    out_dir = CONFIG["outDir"]
    os.makedirs(out_dir, exist_ok=True)
    COV = coverage.Coverage(
        data_file=os.path.join(out_dir, f".coverage.{os.getpid()}"),
        include=CONFIG.get("files") or None,
        config_file=False,
        branch=False,
    )
    COV.start()

    def _save():
        if COV is not None:
            try:
                COV.stop()
                COV.save()
            except Exception:
                pass

    atexit.register(_save)


_main()
