"""
Synthesizer: uses Claude to generate a SkillForge-compatible SKILL.md from a task summary.
"""

import os
import re
from dataclasses import dataclass

from .adapter import TaskSummary


@dataclass
class SynthesisResult:
    skill_id: str           # URL-safe slug, e.g. "debug-python-import-errors"
    skill_md: str           # Full SKILL.md content with frontmatter
    is_novel: bool          # True if this looks like a new reusable pattern
    confidence: float       # 0.0-1.0 how confident the LLM is this is worth capturing


_MODEL = "claude-haiku-4-5-20251001"

_PROMPT_TEMPLATE = """\
You are analyzing a completed AI assistant session to determine if it contains a reusable workflow worth capturing as a skill.

## Session Summary
Task: {task_description}
Tool calls made ({tool_count}): {tool_calls_list}
Outcome: {outcome}
Key actions: {key_actions_list}

## Existing skills (to avoid duplicates)
{existing_skills_list}

## Conversation
{conversation_text}

## Instructions
1. First determine: is there a REUSABLE, GENERALIZABLE workflow here? Not a one-off task, but a pattern that could help Claude handle similar tasks in the future.
2. If yes, generate a SKILL.md in this EXACT format:

---
name: <Human readable name, title case>
description: <One sentence describing what this skill helps with>
category: <workflow|tool_guide|domain|integration|guardrail>
tags: [<3-5 relevant tags>]
version: 1.0.0
author: auto-captured
---

# <Skill Name>

## When to Use
<2-3 sentences on when Claude should use this skill>

## Process
1. <Step one>
2. <Step two>
...

## Key Considerations
- <Important thing to remember>
- <Common pitfall to avoid>

3. If this is NOT a novel reusable pattern, respond with exactly: NOT_NOVEL

Respond with either the SKILL.md content or NOT_NOVEL.\
"""


def _slugify(name: str) -> str:
    """Convert a skill name to a URL-safe slug, max 40 chars."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:40]


def _extract_name_from_frontmatter(skill_md: str) -> str:
    """Pull 'name' value from YAML frontmatter."""
    match = re.search(r"^name:\s*(.+)$", skill_md, re.MULTILINE)
    if match:
        return match.group(1).strip()
    # Fallback: use first H1
    match = re.search(r"^#\s+(.+)$", skill_md, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return "auto-captured-skill"


def _unique_skill_id(base_id: str, existing: list) -> str:
    """Append -v2, -v3, ... if base_id already exists in the known list."""
    if base_id not in existing:
        return base_id
    for n in range(2, 100):
        candidate = f"{base_id}-v{n}"
        if candidate not in existing:
            return candidate
    return base_id


def synthesize_skill(summary: TaskSummary, existing_skills: list) -> "SynthesisResult | None":
    """Call Claude to synthesize a SKILL.md from a TaskSummary.

    Returns None on any unrecoverable error (missing package, missing API key, etc.).
    Returns a SynthesisResult with is_novel=False if LLM says NOT_NOVEL.
    """
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("anthropic package not installed; cannot synthesize skill")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY env var not set; cannot synthesize skill")

    tool_calls_list = "\n".join(f"  - {tc}" for tc in summary.tool_calls) or "  (none)"
    key_actions_list = "\n".join(f"  - {ka}" for ka in summary.key_actions) or "  (none)"
    existing_skills_list = (
        "\n".join(f"  - {s}" for s in existing_skills) if existing_skills else "  (none)"
    )

    prompt = _PROMPT_TEMPLATE.format(
        task_description=summary.task_description,
        tool_count=summary.tool_count,
        tool_calls_list=tool_calls_list,
        outcome=summary.outcome,
        key_actions_list=key_actions_list,
        existing_skills_list=existing_skills_list,
        conversation_text=summary.conversation_text,
    )

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=_MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = ""
    for block in message.content:
        if hasattr(block, "text"):
            response_text += block.text

    response_text = response_text.strip()

    if response_text == "NOT_NOVEL" or response_text.startswith("NOT_NOVEL"):
        return SynthesisResult(
            skill_id="",
            skill_md="",
            is_novel=False,
            confidence=0.0,
        )

    # Extract skill name and build ID
    name = _extract_name_from_frontmatter(response_text)
    base_id = _slugify(name)
    skill_id = _unique_skill_id(base_id, existing_skills)

    return SynthesisResult(
        skill_id=skill_id,
        skill_md=response_text,
        is_novel=True,
        confidence=0.8,
    )
