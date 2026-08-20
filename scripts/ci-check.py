#!/usr/bin/env python3
"""Check CI dependencies, validate the project, run tests, and build."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_JSON = PROJECT_ROOT / "package.json"
REQUIRED_EXECUTABLES = ("bun",)
CHECK_SCRIPTS = ("typecheck:core", "typecheck:browser", "check:dependencies")
BUILD_SCRIPT = "build"


def check_executables() -> bool:
    missing = [name for name in REQUIRED_EXECUTABLES if shutil.which(name) is None]
    if not missing:
        print("CI dependencies available: " + ", ".join(REQUIRED_EXECUTABLES))
        return True

    print(
        "Missing required CI dependencies: " + ", ".join(missing),
        file=sys.stderr,
    )
    return False


def read_ci_scripts() -> list[str]:
    package = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    scripts = package.get("scripts")
    if not isinstance(scripts, dict):
        raise ValueError("package.json must contain a scripts object")

    required_scripts = (*CHECK_SCRIPTS, BUILD_SCRIPT)
    missing_scripts = [
        name for name in required_scripts if not isinstance(scripts.get(name), str)
    ]
    if missing_scripts:
        raise ValueError(
            "package.json is missing required CI scripts: " + ", ".join(missing_scripts)
        )

    test_scripts = [
        name
        for name, command in scripts.items()
        if name.startswith("test:") and isinstance(command, str)
    ]
    if not test_scripts:
        raise ValueError("package.json contains no test:* scripts")

    return [*CHECK_SCRIPTS, BUILD_SCRIPT, *test_scripts]


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
        ci_scripts = read_ci_scripts()
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Cannot read project CI scripts: {error}", file=sys.stderr)
        return 1

    if not run(["bun", "install", "--frozen-lockfile"]):
        return 1

    for script in ci_scripts:
        if not run(["bun", "run", script]):
            return 1

    print(f"\nCI check passed: {len(ci_scripts)} scripts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
