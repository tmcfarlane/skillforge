import type { Skill, ValidationResult, ValidationWarning } from '@skillforge/core';

// ─── ANSI helpers ────────────────────────────────────────────────────────────

export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Formatting helpers ──────────────────────────────────────────────────────

/**
 * Returns the list-view summary string for a skill (used by `list` and `search`).
 */
export function formatSkillSummary(skill: Skill): string {
  const { id, name, category, tags, description } = skill.manifest;
  const lines: string[] = [];
  lines.push(`${bold('\u250c\u2500')} ${bold(id)} ${dim(`[${category}]`)}`);
  lines.push(`${dim('\u2502')}  ${name !== id ? name + ' \u2014 ' : ''}${description}`);
  if (tags.length > 0) {
    lines.push(`${dim('\u2502')}  ${dim('Tags:')} ${tags.join(', ')}`);
  }
  lines.push(dim('\u2502'));
  return lines.join('\n');
}

/**
 * Returns the validate-command output string for a single skill validation result.
 */
export function formatValidationResult(
  id: string,
  result: ValidationResult,
  warnings: ValidationWarning[],
): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(`${green('\u2713')} ${bold(id)} ${dim('\u2014 valid')}`);
  } else {
    lines.push(
      `${red('\u2717')} ${bold(id)} ${dim('\u2014')} ${red(`${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`)}`,
    );
  }

  for (const warn of warnings) {
    lines.push(`  ${yellow('\u26a0')} ${warn.message}`);
  }

  for (const err of result.errors) {
    lines.push(`  ${red('\u2717')} ${dim(`[${err.field}]`)} ${err.message}`);
  }

  return lines.join('\n');
}
