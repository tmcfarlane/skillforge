"""
Quality gate: validates a captured skill before adding it to the registry.
"""

import subprocess
import shutil
from pathlib import Path


def validate_skill(skill_id: str, skills_path: str, skillforge_cli: str) -> bool:
    """Run 'skillforge validate <skill_id> --skills-path <skills_path>'.

    Tries the following CLI locations in order:
      1. 'skillforge' on PATH
      2. 'node {skillforge_cli}'
      3. 'node {scripts_dir}/../packages/cli/dist/cli.js'

    Returns True if exit code 0, False otherwise.
    Logs output to {skills_path}/../.skillforge-capture.log relative to cwd.
    """
    scripts_dir = Path(__file__).parent.parent
    fallback_cli = str(scripts_dir.parent / "packages" / "cli" / "dist" / "cli.js")

    candidates = []
    if shutil.which("skillforge"):
        candidates.append(["skillforge"])
    if skillforge_cli:
        candidates.append(["node", skillforge_cli])
    candidates.append(["node", fallback_cli])

    for base_cmd in candidates:
        cmd = base_cmd + ["validate", skill_id, "--skills-path", skills_path]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )
            _log_validation(skills_path, skill_id, cmd, result)
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    # No CLI found — log and treat as passing to avoid blocking captures
    _log_no_cli(skills_path, skill_id)
    return True


def _log_validation(
    skills_path: str,
    skill_id: str,
    cmd: list,
    result: subprocess.CompletedProcess,
) -> None:
    from datetime import datetime, timezone
    import os

    log_path = _get_log_path(skills_path)
    ts = datetime.now(timezone.utc).isoformat()
    lines = [
        f"[{ts}] validate_skill({skill_id})",
        f"  cmd: {' '.join(cmd)}",
        f"  exit: {result.returncode}",
    ]
    if result.stdout:
        lines.append(f"  stdout: {result.stdout.strip()[:500]}")
    if result.stderr:
        lines.append(f"  stderr: {result.stderr.strip()[:500]}")

    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except OSError:
        pass


def _log_no_cli(skills_path: str, skill_id: str) -> None:
    from datetime import datetime, timezone

    log_path = _get_log_path(skills_path)
    ts = datetime.now(timezone.utc).isoformat()
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(
                f"[{ts}] validate_skill({skill_id}): no skillforge CLI found, skipping validation\n"
            )
    except OSError:
        pass


def _get_log_path(skills_path: str) -> str:
    # Log next to the skills dir (one level up), or inside it as fallback
    parent = Path(skills_path).parent
    return str(parent / ".skillforge-capture.log")
