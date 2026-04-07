#!/usr/bin/env python3
"""
SkillForge Auto-Capture Hook
============================
Claude Code Stop hook. Detects reusable patterns in completed sessions
and captures them as SkillForge skills automatically.

Configure in ~/.claude/settings.json:
  "Stop": [{"command": "python3 /Users/.../skillforge/scripts/capture-hook.py"}]
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Logging — NEVER write to stdout/stderr; always append to log file
# ---------------------------------------------------------------------------

_log_path: str = ""


def _init_log(cwd: str) -> None:
    global _log_path
    _log_path = str(Path(cwd) / ".skillforge-capture.log")


def _log(msg: str) -> None:
    if not _log_path:
        return
    ts = datetime.now(timezone.utc).isoformat()
    try:
        with open(_log_path, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {msg}\n")
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Config discovery
# ---------------------------------------------------------------------------

def _find_config(cwd: str) -> dict:
    """Walk upward from cwd looking for skillforge.config.json or .skillforgerc."""
    search = Path(cwd).resolve()
    for directory in [search, *search.parents]:
        for name in ("skillforge.config.json", ".skillforgerc"):
            candidate = directory / name
            if candidate.exists():
                try:
                    return json.loads(candidate.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    pass
    return {}


def _get_skills_path(config: dict, cwd: str) -> str:
    skills_path = config.get("skillsPath") or config.get("skills_path")
    if skills_path:
        p = Path(skills_path)
        if not p.is_absolute():
            p = Path(cwd) / p
        return str(p)
    return str(Path(cwd) / "skills")


# ---------------------------------------------------------------------------
# Transcript search fallback
# ---------------------------------------------------------------------------

def _find_transcript(session_id: str) -> "str | None":
    """Search ~/.claude/projects/ for a JSONL file matching session_id."""
    projects_dir = Path.home() / ".claude" / "projects"
    if not projects_dir.exists():
        return None
    for jsonl in projects_dir.rglob("*.jsonl"):
        if session_id in jsonl.stem or session_id in jsonl.name:
            return str(jsonl)
    return None


# ---------------------------------------------------------------------------
# Novelty filter
# ---------------------------------------------------------------------------

_ERROR_KEYWORDS = [
    "i cannot", "failed", "error occurred", "i'm unable", "i am unable",
]


def _passes_novelty_filter(transcript_path: str) -> "tuple[bool, str]":
    """Return (passes, reason). True means we should proceed with capture."""
    try:
        lines = Path(transcript_path).read_text(encoding="utf-8").splitlines()
    except OSError as e:
        return False, f"cannot read transcript: {e}"

    messages = []
    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            messages.append(json.loads(raw))
        except json.JSONDecodeError:
            continue

    if len(messages) < 5:
        return False, f"only {len(messages)} messages (need >= 5)"

    # Count tool calls across all assistant messages
    tool_call_count = 0
    last_assistant_text = ""
    edit_write_count = 0

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", [])
        if role == "assistant" and isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "tool_use":
                        tool_call_count += 1
                        name = block.get("name", "")
                        if name in ("Edit", "Write", "Read"):
                            edit_write_count += 1
                    elif block.get("type") == "text":
                        last_assistant_text = block.get("text", "")

    if tool_call_count < 2:
        return False, f"only {tool_call_count} tool calls (need >= 2)"

    text_lower = last_assistant_text.lower()
    if any(kw in text_lower for kw in _ERROR_KEYWORDS):
        return False, "last assistant message contains error keywords"

    # Single file read/write pattern — not interesting
    if tool_call_count <= 2 and edit_write_count == tool_call_count:
        return False, "looks like a single file read/write only"

    return True, "ok"


# ---------------------------------------------------------------------------
# Background capture process
# ---------------------------------------------------------------------------

def _run_capture(payload: dict) -> None:
    """Main capture logic; runs in background subprocess."""
    session_id = payload.get("session_id", "unknown")
    transcript_path = payload.get("transcript_path", "")
    cwd = payload.get("cwd", str(Path.home()))

    _init_log(cwd)
    _log(f"capture start — session={session_id}")

    # Resolve transcript
    if not transcript_path or not Path(transcript_path).exists():
        transcript_path = _find_transcript(session_id) or ""
    if not transcript_path or not Path(transcript_path).exists():
        _log("no transcript found; skipping")
        return

    # Novelty filter
    passes, reason = _passes_novelty_filter(transcript_path)
    if not passes:
        _log(f"novelty filter rejected: {reason}")
        return

    # Config
    config = _find_config(cwd)
    skills_path = _get_skills_path(config, cwd)
    Path(skills_path).mkdir(parents=True, exist_ok=True)

    # Import capture_lib — it lives next to this script
    scripts_dir = Path(__file__).parent
    sys.path.insert(0, str(scripts_dir))

    try:
        from capture_lib.adapter import extract_task_summary
        from capture_lib.synthesizer import synthesize_skill
        from capture_lib.lineage import SkillLineage
        from capture_lib.quality_gate import validate_skill
    except ImportError as e:
        _log(f"import error: {e}")
        return

    # Extract summary
    try:
        summary = extract_task_summary(transcript_path, session_id, cwd)
    except Exception as e:
        _log(f"extract_task_summary failed: {e}")
        return

    _log(
        f"summary: tool_count={summary.tool_count}, outcome={summary.outcome}, "
        f"task={summary.task_description[:80]}"
    )

    # Collect known skill IDs
    lineage = SkillLineage(skills_path)
    try:
        existing_ids = lineage.get_all_skill_ids()
        disk_ids = [
            d.name for d in Path(skills_path).iterdir()
            if d.is_dir() and not d.name.startswith(".")
        ]
        all_known = list(set(existing_ids + disk_ids))

        # Synthesize
        try:
            result = synthesize_skill(summary, all_known)
        except Exception as e:
            _log(f"synthesize_skill failed: {e}")
            return

        if result is None:
            _log("synthesize_skill returned None; skipping")
            return

        if not result.is_novel:
            _log("LLM determined session is NOT_NOVEL; skipping")
            return

        if result.confidence < 0.6:
            _log(f"confidence {result.confidence} below threshold 0.6; skipping")
            return

        _log(f"synthesized skill_id={result.skill_id} confidence={result.confidence}")

        # Determine DERIVED vs CAPTURED
        similar = lineage.find_similar(result.skill_id, all_known)
        evolution_type = "derived" if similar else "captured"
        parent = similar

        # Write skill to disk
        skill_dir = Path(skills_path) / result.skill_id
        skill_dir.mkdir(exist_ok=True)
        (skill_dir / "SKILL.md").write_text(result.skill_md, encoding="utf-8")

        # Quality gate
        cli_path = str(
            Path(__file__).parent.parent / "packages" / "cli" / "dist" / "cli.js"
        )
        if not validate_skill(result.skill_id, skills_path, cli_path):
            _log(f"quality gate failed for {result.skill_id}; removing skill dir")
            shutil.rmtree(skill_dir, ignore_errors=True)
            return

        # Record lineage
        lineage.record(
            skill_id=result.skill_id,
            session_id=summary.session_id,
            task_description=summary.task_description,
            confidence=result.confidence,
            evolution_type=evolution_type,
            parent_skill_id=parent,
            skill_path=str(skill_dir),
        )

        _log(
            f"captured skill '{result.skill_id}' ({evolution_type}) "
            f"from session {session_id}"
        )

    finally:
        lineage.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    # Read payload from stdin
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}

    cwd = payload.get("cwd", str(Path.cwd()))
    _init_log(cwd)

    # Novelty pre-check: if transcript is missing we still fork (the subprocess
    # will handle the "not found" case gracefully).
    transcript_path = payload.get("transcript_path", "")
    session_id = payload.get("session_id", "")

    # Quick early exit: if transcript exists and obviously fails novelty
    if transcript_path and Path(transcript_path).exists():
        passes, reason = _passes_novelty_filter(transcript_path)
        if not passes:
            _log(f"pre-fork novelty filter rejected: {reason}")
            sys.exit(0)

    # Fork to background so the hook returns immediately
    payload_json = json.dumps(payload)

    try:
        proc = subprocess.Popen(
            [
                sys.executable,
                __file__,
                "--background",
                payload_json,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            start_new_session=True,  # os.setsid() equivalent in Popen
        )
        _log(f"forked background capture pid={proc.pid}")
    except Exception as e:
        _log(f"failed to fork background process: {e}")

    sys.exit(0)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--background":
        # Running as the background subprocess
        try:
            payload = json.loads(sys.argv[2])
        except (json.JSONDecodeError, IndexError):
            payload = {}
        try:
            _run_capture(payload)
        except Exception as e:
            cwd = payload.get("cwd", str(Path.cwd()))
            _init_log(cwd)
            _log(f"unhandled exception in _run_capture: {e}")
        sys.exit(0)
    else:
        main()
