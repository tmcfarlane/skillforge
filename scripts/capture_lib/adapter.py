"""
Adapter: Claude Code transcript -> task summary for skill synthesis.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class TaskSummary:
    task_description: str   # First user message (truncated to 2000 chars)
    tool_calls: list        # ["Bash: ls -la", "Edit: src/foo.py", ...]
    tool_count: int
    outcome: str            # "success" | "partial" | "unknown"
    key_actions: list       # Notable things Claude did (edit, create, bash commands)
    conversation_text: str  # Formatted full conversation (max 40000 chars)
    session_id: str
    cwd: str


_ERROR_KEYWORDS = [
    "i cannot", "failed", "error occurred", "i'm unable", "i am unable",
    "cannot complete", "unable to complete",
]

_SUCCESS_KEYWORDS = [
    "done", "complete", "finished", "successfully", "created", "updated",
    "implemented", "fixed", "added", "here is", "here's",
]


def _content_to_text(content) -> str:
    """Extract plain text from a content field (string or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "tool_result":
                    result_content = block.get("content", "")
                    if isinstance(result_content, list):
                        for rc in result_content:
                            if isinstance(rc, dict) and rc.get("type") == "text":
                                parts.append(rc.get("text", ""))
                    else:
                        parts.append(str(result_content))
        return "\n".join(parts)
    return ""


def _summarize_input(name: str, inp: dict) -> str:
    """Build a short one-liner summary of a tool call input."""
    if name == "Bash":
        cmd = inp.get("command", "")
        return cmd[:80] + ("..." if len(cmd) > 80 else "")
    if name in ("Edit", "Write", "Read"):
        path = inp.get("file_path", inp.get("path", ""))
        return path
    if name == "Glob":
        return inp.get("pattern", "")
    if name == "Grep":
        return inp.get("pattern", "")
    # Generic: first string value
    for v in inp.values():
        if isinstance(v, str):
            return v[:80]
    return str(inp)[:80]


def _determine_outcome(last_assistant_text: str) -> str:
    text_lower = last_assistant_text.lower()
    has_error = any(kw in text_lower for kw in _ERROR_KEYWORDS)
    has_success = any(kw in text_lower for kw in _SUCCESS_KEYWORDS)
    if has_error and not has_success:
        return "partial"
    if has_success and not has_error:
        return "success"
    if has_error and has_success:
        return "partial"
    return "unknown"


def extract_task_summary(transcript_path: str, session_id: str, cwd: str) -> TaskSummary:
    """Parse a Claude Code JSONL transcript into a TaskSummary."""
    lines = Path(transcript_path).read_text(encoding="utf-8").splitlines()

    task_description = ""
    tool_calls: list = []
    key_actions: list = []
    conversation_parts: list = []
    last_assistant_text = ""

    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue

        role = msg.get("role", "")
        content = msg.get("content", "")

        if role == "user":
            # Could be plain user message or tool_result blocks
            if isinstance(content, str):
                text = content.strip()
                if text and not task_description:
                    task_description = text[:2000]
                if text:
                    conversation_parts.append(f"User: {text}")
            elif isinstance(content, list):
                # Check if this is tool results
                has_tool_result = any(
                    isinstance(b, dict) and b.get("type") == "tool_result"
                    for b in content
                )
                if has_tool_result:
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            result_content = block.get("content", "")
                            if isinstance(result_content, list):
                                result_text = " ".join(
                                    rc.get("text", "") for rc in result_content
                                    if isinstance(rc, dict) and rc.get("type") == "text"
                                )
                            else:
                                result_text = str(result_content)
                            truncated = result_text[:200] + ("..." if len(result_text) > 200 else "")
                            conversation_parts.append(f"  [tool result]: {truncated}")
                else:
                    # Plain content blocks as user message
                    text = _content_to_text(content).strip()
                    if text and not task_description:
                        task_description = text[:2000]
                    if text:
                        conversation_parts.append(f"User: {text}")

        elif role == "assistant":
            if isinstance(content, list):
                assistant_text_parts = []
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type", "")
                    if btype == "text":
                        text = block.get("text", "").strip()
                        if text:
                            assistant_text_parts.append(text)
                            last_assistant_text = text
                    elif btype == "tool_use":
                        name = block.get("name", "")
                        inp = block.get("input", {})
                        summary = _summarize_input(name, inp)
                        call_str = f"{name}({summary})"
                        tool_calls.append(call_str)
                        conversation_parts.append(f"  [tool]: {call_str}")
                        # Key actions: edits, writes, bash commands
                        if name in ("Edit", "Write"):
                            key_actions.append(f"{name} {inp.get('file_path', inp.get('path', ''))}")
                        elif name == "Bash":
                            cmd = inp.get("command", "")[:100]
                            key_actions.append(f"Bash: {cmd}")
                        elif name == "Write":
                            key_actions.append(f"Write {inp.get('file_path', '')}")

                if assistant_text_parts:
                    combined = " ".join(assistant_text_parts)
                    truncated = combined[:500] + ("..." if len(combined) > 500 else "")
                    conversation_parts.append(f"Assistant: {truncated}")
            elif isinstance(content, str):
                text = content.strip()
                if text:
                    last_assistant_text = text
                    truncated = text[:500] + ("..." if len(text) > 500 else "")
                    conversation_parts.append(f"Assistant: {truncated}")

    conversation_text = "\n".join(conversation_parts)
    if len(conversation_text) > 40000:
        conversation_text = conversation_text[:40000] + "\n... [truncated]"

    outcome = _determine_outcome(last_assistant_text)

    return TaskSummary(
        task_description=task_description or "(no description)",
        tool_calls=tool_calls,
        tool_count=len(tool_calls),
        outcome=outcome,
        key_actions=key_actions[:50],
        conversation_text=conversation_text,
        session_id=session_id,
        cwd=cwd,
    )
