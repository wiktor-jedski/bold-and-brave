#!/usr/bin/env python3
"""Run machine-specific acceptance checks that must not run in general CI."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_JSON = PROJECT_ROOT / "package.json"
REQUIRED_EXECUTABLES = ("bun",)
LOCAL_SCRIPTS = ("check:support-row",)


def check_executables() -> bool:
    missing = [name for name in REQUIRED_EXECUTABLES if shutil.which(name) is None]
    if not missing:
        print("Local-check dependencies available: " + ", ".join(REQUIRED_EXECUTABLES))
        return True

    print(
        "Missing required local-check dependencies: " + ", ".join(missing),
        file=sys.stderr,
    )
    return False


def read_local_scripts() -> tuple[str, ...]:
    package = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    scripts = package.get("scripts")
    if not isinstance(scripts, dict):
        raise ValueError("package.json must contain a scripts object")

    missing_scripts = [
        name for name in LOCAL_SCRIPTS if not isinstance(scripts.get(name), str)
    ]
    if missing_scripts:
        raise ValueError(
            "package.json is missing required local scripts: "
            + ", ".join(missing_scripts)
        )

    return LOCAL_SCRIPTS


def run(command: list[str]) -> bool:
    print(f"\n$ {' '.join(command)}", flush=True)
    result = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
    if result.returncode == 0:
        return True

    print(
        f"Command failed with exit code {result.returncode}: {' '.join(command)}",
        file=sys.stderr,
    )
    return False


def main() -> int:
    if not check_executables():
        return 1

    try:
        local_scripts = read_local_scripts()
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Cannot read project local scripts: {error}", file=sys.stderr)
        return 1

    for script in local_scripts:
        if not run(["bun", "run", script]):
            return 1

    print(f"\nLocal check passed: {len(local_scripts)} script")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
