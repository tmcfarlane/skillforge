import { Skill, SkillRuntimeContext, ExecutionPlan, ExecutionStep } from './types';

export interface PlanBuilderOptions {
  /** Maximum number of steps to extract (default: 20) */
  maxSteps?: number;
  /** Whether to include optional steps (default: true) */
  includeOptional?: boolean;
}

/**
 * Builds a structured ExecutionPlan from a skill and runtime context.
 *
 * Uses heuristic markdown parsing to extract steps from SKILL.md:
 * - Numbered lists (1. Step one / 2. Step two) become sequential steps
 * - Checklist items (- [ ] Step) become optional steps
 * - Section headings become step group names
 *
 * This is intentionally lightweight — it's a structural scaffold for execution,
 * not a comprehensive AI-driven planner.
 */
export class ExecutionPlanBuilder {

  /**
   * Build an ExecutionPlan from a skill and runtime context.
   */
  static build(skill: Skill, context: SkillRuntimeContext, options: PlanBuilderOptions = {}): ExecutionPlan {
    const { maxSteps = 20, includeOptional = true } = options;
    const steps = this.extractSteps(skill.instructions, maxSteps, includeOptional);

    // Attach tool hints from integration requirements
    const integrationTools = (skill.manifest.integrations ?? []).map(i => i.name);

    // If no steps were found via heuristics, add a fallback step referencing the skill
    if (steps.length === 0) {
      steps.push({
        id: 'step-1',
        name: `Execute ${skill.manifest.name}`,
        description: `Follow instructions in ${skill.manifest.name} SKILL.md`,
        optional: false,
      });
    }

    // Estimate duration: 30s base + 60s per step (rough heuristic)
    const estimatedDurationMs = (30 + steps.length * 60) * 1000;

    return {
      skill,
      context,
      steps: steps.map(step => ({
        ...step,
        tools: step.tools ?? (integrationTools.length > 0 ? integrationTools : undefined),
      })),
      estimatedDurationMs,
    };
  }

  /**
   * Extract steps from SKILL.md content using markdown heuristics.
   */
  static extractSteps(
    markdown: string,
    maxSteps: number,
    includeOptional: boolean
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    const lines = markdown.split('\n');

    let currentSection = '';
    let stepCounter = 0;

    for (const line of lines) {
      if (steps.length >= maxSteps) break;

      // Detect section headings (## or ###)
      const headingMatch = line.match(/^#{2,3}\s+(.+)$/);
      if (headingMatch) {
        currentSection = headingMatch[1].trim();
        continue;
      }

      // Detect numbered list items: "1. Step text" or "1) Step text"
      const numberedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        const text = numberedMatch[1].trim();
        if (text) {
          stepCounter++;
          steps.push({
            id: `step-${stepCounter}`,
            name: this.truncate(text, 60),
            description: text,
            dependsOn: stepCounter > 1 ? [`step-${stepCounter - 1}`] : undefined,
            optional: false,
          });
        }
        continue;
      }

      // Detect checklist items: "- [ ] Step text" (optional steps)
      if (includeOptional) {
        const checklistMatch = line.match(/^\s*-\s+\[\s\]\s+(.+)$/);
        if (checklistMatch) {
          const text = checklistMatch[1].trim();
          if (text) {
            stepCounter++;
            steps.push({
              id: `step-${stepCounter}`,
              name: this.truncate(text, 60),
              description: currentSection ? `[${currentSection}] ${text}` : text,
              optional: true,
            });
          }
          continue;
        }
      }
    }

    return steps;
  }

  private static truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
  }
}
