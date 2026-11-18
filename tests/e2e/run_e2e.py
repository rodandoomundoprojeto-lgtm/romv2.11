#!/usr/bin/env python3
"""Unified 4-Tier E2E & QA Verification Runner for ROM V2.1.

Stages:
  1. Python 4-tier E2E suite: python -m pytest tests/e2e -v --tb=short
  2. Node Edge & Frontend E2E suite: node --test tests/e2e/test_edge_and_frontend_e2e.mjs
  3. Project QA cross-audit: powershell -ExecutionPolicy Bypass -File .agents/skills/multi-agent-orchestrator/scripts/qa_check.ps1
  4. Extended Python syntax check: python -m py_compile across api/*.py, redacao_v2/*.py, curadoria/**/*.py, scripts/*.py, tests/e2e/*.py
  5. Existing project unit suites:
     - python -m pytest curadoria/tests -q
     - node scripts/test_radar_frontend_time.js
     - scripts/test_fontes_youtube.py (offline-filtered when --offline is passed; full unittest otherwise)

Usage:
  python tests/e2e/run_e2e.py
  python tests/e2e/run_e2e.py --offline
  python tests/e2e/run_e2e.py --offline --json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
LIVE_YOUTUBE_TESTS = ("test_youtube_feeds_live", "test_collector_transcript_extraction")


def _run_cmd(cmd: List[str], env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    start = time.monotonic()
    proc = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    elapsed = round(time.monotonic() - start, 2)
    return {
        "command": " ".join(cmd),
        "returncode": proc.returncode,
        "passed": proc.returncode == 0,
        "duration_sec": elapsed,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def _collect_py_compile_targets() -> List[Path]:
    targets: List[Path] = []
    targets.extend(sorted((REPO_ROOT / "api").glob("*.py")))
    targets.extend(sorted((REPO_ROOT / "redacao_v2").glob("*.py")))
    targets.extend(sorted((REPO_ROOT / "curadoria").rglob("*.py")))
    targets.extend(sorted((REPO_ROOT / "scripts").glob("*.py")))
    targets.extend(sorted((REPO_ROOT / "tests" / "e2e").glob("*.py")))
    return [p for p in targets if p.is_file() and "__pycache__" not in p.parts]


def run_stage_1_python_e2e() -> Dict[str, Any]:
    cmd = [sys.executable, "-m", "pytest", "tests/e2e", "-v", "--tb=short"]
    res = _run_cmd(cmd)
    return {"stage": "1. Python E2E (tests/e2e)", **res}


def run_stage_2_node_e2e() -> Dict[str, Any]:
    mjs_path = REPO_ROOT / "tests" / "e2e" / "test_edge_and_frontend_e2e.mjs"
    if not mjs_path.is_file():
        return {
            "stage": "2. Node Edge & Frontend E2E",
            "command": "node --test tests/e2e/test_edge_and_frontend_e2e.mjs",
            "returncode": 1,
            "passed": False,
            "duration_sec": 0.0,
            "stdout": "",
            "stderr": f"Missing required Edge & Frontend E2E suite: {mjs_path}",
        }
    cmd = ["node", "--test", "tests/e2e/test_edge_and_frontend_e2e.mjs"]
    res = _run_cmd(cmd)
    return {"stage": "2. Node Edge & Frontend E2E", **res}


def run_stage_3_qa_check() -> Dict[str, Any]:
    qa_script = REPO_ROOT / ".agents" / "skills" / "multi-agent-orchestrator" / "scripts" / "qa_check.ps1"
    cmd = ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(qa_script)]
    res = _run_cmd(cmd)
    return {"stage": "3. QA Cross-Audit (qa_check.ps1)", **res}


def run_stage_4_py_compile() -> Dict[str, Any]:
    targets = _collect_py_compile_targets()
    if not targets:
        return {
            "stage": "4. Python Syntax (py_compile)",
            "command": "python -m py_compile <targets>",
            "returncode": 1,
            "passed": False,
            "duration_sec": 0.0,
            "stdout": "",
            "stderr": "No Python files discovered for py_compile.",
        }
    rel_targets = [str(p.relative_to(REPO_ROOT)) for p in targets]
    cmd = [sys.executable, "-m", "py_compile", *rel_targets]
    res = _run_cmd(cmd)
    res["command"] = f"{sys.executable} -m py_compile ({len(rel_targets)} files)"
    return {"stage": "4. Python Syntax (py_compile)", **res}


def run_stage_5_existing_suites(offline: bool) -> Dict[str, Any]:
    subresults: List[Dict[str, Any]] = []

    subresults.append({
        "name": "curadoria/tests (pytest)",
        **_run_cmd([sys.executable, "-m", "pytest", "curadoria/tests", "-q"]),
    })
    subresults.append({
        "name": "scripts/test_radar_frontend_time.js (node)",
        **_run_cmd(["node", "scripts/test_radar_frontend_time.js"]),
    })

    if offline:
        skip_set = repr(set(LIVE_YOUTUBE_TESTS))
        offline_script = "\n".join([
            "import sys, unittest",
            "loader = unittest.TestLoader()",
            "suite = loader.loadTestsFromName('scripts.test_fontes_youtube')",
            "filtered = unittest.TestSuite()",
            f"skip = {skip_set}",
            "def walk(s):",
            "    for t in s:",
            "        if isinstance(t, unittest.TestSuite):",
            "            walk(t)",
            "        elif getattr(t, '_testMethodName', '') not in skip:",
            "            filtered.addTest(t)",
            "walk(suite)",
            "res = unittest.TextTestRunner(verbosity=2).run(filtered)",
            "sys.exit(0 if res.wasSuccessful() else 1)",
        ])
        yt_cmd = [sys.executable, "-c", offline_script]
        yt_res = _run_cmd(yt_cmd)
        yt_res["command"] = f"{sys.executable} -m unittest scripts/test_fontes_youtube.py (offline-filtered)"
    else:
        yt_res = _run_cmd([sys.executable, "-m", "unittest", "scripts/test_fontes_youtube.py"])

    subresults.append({
        "name": "scripts/test_fontes_youtube.py (unittest)",
        **yt_res,
    })

    all_ok = all(s["passed"] for s in subresults)
    total_dur = round(sum(s["duration_sec"] for s in subresults), 2)
    combined_stdout = "\n".join(f"--- {s['name']} ---\n{s['stdout']}" for s in subresults if s["stdout"])
    combined_stderr = "\n".join(f"--- {s['name']} ---\n{s['stderr']}" for s in subresults if s["stderr"])

    return {
        "stage": "5. Existing Project Suites",
        "command": "; ".join(s["command"] for s in subresults),
        "returncode": 0 if all_ok else 1,
        "passed": all_ok,
        "duration_sec": total_dur,
        "stdout": combined_stdout,
        "stderr": combined_stderr,
        "subchecks": subresults,
    }


def _print_summary_table(stages: List[Dict[str, Any]], overall_passed: bool, offline: bool) -> None:
    print("\n" + "=" * 78)
    print(f"ROM V2.1 E2E VERIFICATION SUMMARY (offline={offline})")
    print("=" * 78)
    print(f"{'Stage':<42} {'Status':<10} {'Time (s)':>8}")
    print("-" * 78)
    for st in stages:
        status = "PASS" if st["passed"] else "FAIL"
        print(f"{st['stage']:<42} {status:<10} {st['duration_sec']:>8.2f}")
        for sub in st.get("subchecks", []):
            sub_status = "PASS" if sub["passed"] else "FAIL"
            print(f"  - {sub['name']:<38} {sub_status:<10} {sub['duration_sec']:>8.2f}")
    print("-" * 78)
    print(f"OVERALL RESULT: {'PASS' if overall_passed else 'FAIL'}")
    print("=" * 78)

    for st in stages:
        if not st["passed"]:
            print(f"\n[FAILURE DETAILS] {st['stage']}")
            if st["stdout"].strip():
                print("--- stdout ---\n" + st["stdout"].strip())
            if st["stderr"].strip():
                print("--- stderr ---\n" + st["stderr"].strip())


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Unified E2E & QA verification runner for ROM V2.1.")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip live-network YouTube methods in scripts/test_fontes_youtube.py.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Emit structured JSON summary to stdout.",
    )
    args = parser.parse_args(argv)

    stages = [
        run_stage_1_python_e2e(),
        run_stage_2_node_e2e(),
        run_stage_3_qa_check(),
        run_stage_4_py_compile(),
        run_stage_5_existing_suites(offline=args.offline),
    ]
    overall_passed = all(st["passed"] for st in stages)

    if args.json_output:
        report = {
            "ok": overall_passed,
            "offline": args.offline,
            "total_duration_sec": round(sum(st["duration_sec"] for st in stages), 2),
            "stages": stages,
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_summary_table(stages, overall_passed, offline=args.offline)

    return 0 if overall_passed else 1


if __name__ == "__main__":
    sys.exit(main())
