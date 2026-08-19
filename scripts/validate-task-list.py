#!/usr/bin/env python3
"""Validate the Markdown task list used by implementation planning."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit

REQUIRED_COLUMNS = (
    "ID",
    "Status",
    "Description",
    "Depends On (ID)",
    "Verification Criteria",
)
ALLOWED_STATUSES = frozenset({"OPEN", "PREPARED", "PASSED"})
SEPARATOR_CELL = re.compile(r":?-{3,}:?")
POSITIVE_INTEGER = re.compile(r"[1-9][0-9]*")
MARKDOWN_LINK = re.compile(r"(?<!!)\[[^]]*]\(([^)]+)\)")
DEFAULT_TASK_LIST = (
    Path(__file__).resolve().parents[1] / "docs" / "implementation" / "task-list.md"
)


@dataclass(frozen=True)
class Problem:
    line: int
    message: str


@dataclass(frozen=True)
class Task:
    task_id: int
    dependencies: tuple[int, ...]
    line: int


def split_table_row(line: str) -> list[str] | None:
    """Split one pipe-wrapped Markdown table row, including escaped pipes."""
    stripped = line.strip()
    if len(stripped) < 2 or not stripped.startswith("|") or not stripped.endswith("|"):
        return None

    cells: list[str] = []
    current: list[str] = []
    escaped = False

    for character in stripped[1:-1]:
        if character == "|" and not escaped:
            cells.append("".join(current).strip())
            current = []
        else:
            current.append(character)

        if character == "\\":
            escaped = not escaped
        else:
            escaped = False

    cells.append("".join(current).strip())
    return cells


def normalize_header(cell: str) -> str:
    return " ".join(cell.split())


def is_separator_row(cells: list[str] | None, width: int) -> bool:
    return (
        cells is not None
        and len(cells) == width
        and all(SEPARATOR_CELL.fullmatch(cell.replace(" ", "")) for cell in cells)
    )


def local_link_targets(cell: str) -> list[str]:
    targets: list[str] = []

    for match in MARKDOWN_LINK.finditer(cell):
        target = match.group(1).strip()
        if target.startswith("<"):
            closing_bracket = target.find(">")
            if closing_bracket == -1:
                continue
            target = target[1:closing_bracket]
        else:
            target = target.split(maxsplit=1)[0]

        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        targets.append(unquote(parsed.path))

    return targets


def parse_dependencies(value: str, line: int, problems: list[Problem]) -> tuple[int, ...]:
    if not value:
        return ()

    dependencies: list[int] = []
    for token in value.split(","):
        token = token.strip()
        if not POSITIVE_INTEGER.fullmatch(token):
            problems.append(
                Problem(
                    line,
                    "dependencies must be comma-separated positive integer IDs",
                )
            )
            return ()
        dependencies.append(int(token))

    if len(dependencies) != len(set(dependencies)):
        problems.append(Problem(line, "dependency IDs must be unique within a task"))

    return tuple(dependencies)


def find_dependency_cycles(tasks: dict[int, Task]) -> list[Problem]:
    problems: list[Problem] = []
    state: dict[int, int] = {}
    stack: list[int] = []
    stack_positions: dict[int, int] = {}
    reported_cycles: set[frozenset[int]] = set()

    def visit(task_id: int) -> None:
        state[task_id] = 1
        stack_positions[task_id] = len(stack)
        stack.append(task_id)

        for dependency_id in tasks[task_id].dependencies:
            if dependency_id not in tasks or dependency_id == task_id:
                continue

            dependency_state = state.get(dependency_id, 0)
            if dependency_state == 0:
                visit(dependency_id)
            elif dependency_state == 1:
                cycle_start = stack_positions[dependency_id]
                cycle = stack[cycle_start:] + [dependency_id]
                cycle_key = frozenset(cycle[:-1])
                if cycle_key not in reported_cycles:
                    reported_cycles.add(cycle_key)
                    problems.append(
                        Problem(
                            tasks[task_id].line,
                            "dependency cycle: " + " -> ".join(map(str, cycle)),
                        )
                    )

        stack.pop()
        stack_positions.pop(task_id)
        state[task_id] = 2

    for task_id in tasks:
        if state.get(task_id, 0) == 0:
            visit(task_id)

    return problems


def validate_task_list(path: Path, text: str) -> tuple[list[Problem], int]:
    lines = text.splitlines()
    problems: list[Problem] = []
    tasks: dict[int, Task] = {}
    task_order: list[int] = []
    previous_id: int | None = None
    table_count = 0
    row_count = 0
    line_index = 0

    while line_index < len(lines):
        header_cells = split_table_row(lines[line_index])
        if header_cells is None:
            line_index += 1
            continue

        headers = [normalize_header(cell) for cell in header_cells]
        required_overlap = set(headers).intersection(REQUIRED_COLUMNS)
        if len(required_overlap) < 2:
            line_index += 1
            continue

        table_count += 1
        header_line = line_index + 1
        duplicate_headers = sorted(
            {header for header in headers if headers.count(header) > 1}
        )
        for header in duplicate_headers:
            problems.append(Problem(header_line, f"duplicate column: {header}"))

        missing_headers = [header for header in REQUIRED_COLUMNS if header not in headers]
        for header in missing_headers:
            problems.append(Problem(header_line, f"missing required column: {header}"))

        separator_cells = (
            split_table_row(lines[line_index + 1])
            if line_index + 1 < len(lines)
            else None
        )
        if not is_separator_row(separator_cells, len(headers)):
            problems.append(
                Problem(header_line + 1, "table separator does not match the header")
            )
            line_index += 1
            continue

        usable_columns = not duplicate_headers and not missing_headers
        column_indexes = {header: index for index, header in enumerate(headers)}
        row_index = line_index + 2

        while row_index < len(lines):
            cells = split_table_row(lines[row_index])
            if cells is None:
                break

            row_line = row_index + 1
            row_count += 1
            if len(cells) != len(headers):
                problems.append(
                    Problem(
                        row_line,
                        f"task row has {len(cells)} cells; expected {len(headers)}",
                    )
                )
                row_index += 1
                continue

            for cell in cells:
                for target in local_link_targets(cell):
                    linked_path = Path(target)
                    if not linked_path.is_absolute():
                        linked_path = path.parent / linked_path
                    if not linked_path.exists():
                        problems.append(
                            Problem(row_line, f"local link target does not exist: {target}")
                        )

            if not usable_columns:
                row_index += 1
                continue

            raw_id = cells[column_indexes["ID"]]
            status = cells[column_indexes["Status"]]
            description = cells[column_indexes["Description"]]
            dependency_value = cells[column_indexes["Depends On (ID)"]]
            verification = cells[column_indexes["Verification Criteria"]]

            task_id: int | None = None
            if not POSITIVE_INTEGER.fullmatch(raw_id):
                problems.append(Problem(row_line, "ID must be a positive integer"))
            else:
                task_id = int(raw_id)
                if task_id in tasks:
                    problems.append(Problem(row_line, f"duplicate task ID: {task_id}"))
                if previous_id is not None and task_id <= previous_id:
                    problems.append(
                        Problem(
                            row_line,
                            f"task IDs must grow; {task_id} follows {previous_id}",
                        )
                    )
                previous_id = task_id

            if status not in ALLOWED_STATUSES:
                allowed = ", ".join(sorted(ALLOWED_STATUSES))
                problems.append(
                    Problem(row_line, f"invalid status {status!r}; expected one of {allowed}")
                )
            if not description:
                problems.append(Problem(row_line, "Description must not be empty"))
            if not verification:
                problems.append(
                    Problem(row_line, "Verification Criteria must not be empty")
                )

            dependencies = parse_dependencies(dependency_value, row_line, problems)
            if task_id is not None and task_id not in tasks:
                tasks[task_id] = Task(task_id, dependencies, row_line)
                task_order.append(task_id)

            row_index += 1

        line_index = row_index

    if table_count == 0:
        problems.append(
            Problem(1, "no task table contains the required task-list columns")
        )
        return problems, row_count

    order_positions = {task_id: index for index, task_id in enumerate(task_order)}
    for task_id in task_order:
        task = tasks[task_id]
        for dependency_id in task.dependencies:
            if dependency_id == task_id:
                problems.append(
                    Problem(task.line, f"task {task_id} cannot depend on itself")
                )
            elif dependency_id not in tasks:
                problems.append(
                    Problem(
                        task.line,
                        f"task {task_id} depends on missing task {dependency_id}",
                    )
                )
            elif order_positions[dependency_id] >= order_positions[task_id]:
                problems.append(
                    Problem(
                        task.line,
                        f"dependency {dependency_id} must appear before task {task_id}",
                    )
                )

    problems.extend(find_dependency_cycles(tasks))
    return problems, row_count


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "task_list",
        nargs="?",
        type=Path,
        default=DEFAULT_TASK_LIST,
        help="task-list Markdown file (default: docs/implementation/task-list.md)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    path: Path = arguments.task_list

    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        print(f"{path}: error: {error}", file=sys.stderr)
        return 1

    problems, task_count = validate_task_list(path, text)
    if problems:
        for problem in problems:
            print(f"{path}:{problem.line}: error: {problem.message}", file=sys.stderr)
        print(
            f"{path}: invalid task list ({len(problems)} error(s))",
            file=sys.stderr,
        )
        return 1

    noun = "task" if task_count == 1 else "tasks"
    print(f"{path}: valid task list ({task_count} {noun})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
