import { describe, it, expect } from 'vitest';
import { ExecutionPlanBuilder } from '../plan';
import { Skill, SkillCategory, SkillRuntimeContext } from '../types';

const FIXTURE_MARKDOWN = `
## Process

1. First do this important thing
2. Then do that second thing
3. Finally verify the result

## Optional Checks

- [ ] Run the validation
- [ ] Check the output
`;

function makeSkill(overrides: Partial<Skill['manifest']> = {}, instructions = FIXTURE_MARKDOWN): Skill {
  return {
    manifest: {
      id: 'test-skill',
      name: 'Test Skill',
      version: '1.0.0',
      description: 'A test skill',
      category: SkillCategory.WORKFLOW,
      tags: ['test'],
      ...overrides,
    },
    instructions,
    path: '/fake/path/test-skill',
  };
}

function makeContext(skill: Skill): SkillRuntimeContext {
  return {
    skill,
    workingDirectory: '/tmp',
    environment: {},
    availableIntegrations: [],
  };
}

describe('ExecutionPlanBuilder', () => {
  describe('build()', () => {
    it('produces steps in order from numbered list', () => {
      const skill = makeSkill();
      const context = makeContext(skill);
      const plan = ExecutionPlanBuilder.build(skill, context);

      expect(plan.steps.length).toBe(5); // 3 numbered + 2 checklist
      expect(plan.steps[0].id).toBe('step-1');
      expect(plan.steps[0].name).toBe('First do this important thing');
      expect(plan.steps[1].id).toBe('step-2');
      expect(plan.steps[2].id).toBe('step-3');
    });

    it('produces 1 fallback step when no numbered steps found', () => {
      const skill = makeSkill({}, '# Just a heading\n\nSome prose with no lists.');
      const context = makeContext(skill);
      const plan = ExecutionPlanBuilder.build(skill, context);

      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0].id).toBe('step-1');
      expect(plan.steps[0].name).toContain('Test Skill');
    });

    it('includes integration names as tool hints on all steps', () => {
      const skill = makeSkill({
        integrations: [
          { name: 'github', type: 'api', description: 'GitHub API', required: true },
          { name: 'slack', type: 'service', description: 'Slack notifications', required: false },
        ],
      });
      const context = makeContext(skill);
      const plan = ExecutionPlanBuilder.build(skill, context);

      for (const step of plan.steps) {
        expect(step.tools).toEqual(['github', 'slack']);
      }
    });

    it('estimatedDurationMs is greater than 0', () => {
      const skill = makeSkill();
      const context = makeContext(skill);
      const plan = ExecutionPlanBuilder.build(skill, context);

      expect(plan.estimatedDurationMs).toBeGreaterThan(0);
    });

    it('attaches skill and context to the plan', () => {
      const skill = makeSkill();
      const context = makeContext(skill);
      const plan = ExecutionPlanBuilder.build(skill, context);

      expect(plan.skill).toBe(skill);
      expect(plan.context).toBe(context);
    });
  });

  describe('extractSteps()', () => {
    it('parses numbered list items correctly', () => {
      const steps = ExecutionPlanBuilder.extractSteps(FIXTURE_MARKDOWN, 20, false);

      expect(steps.length).toBe(3);
      expect(steps[0].description).toBe('First do this important thing');
      expect(steps[1].description).toBe('Then do that second thing');
      expect(steps[2].description).toBe('Finally verify the result');
    });

    it('parses checklist items as optional steps', () => {
      const steps = ExecutionPlanBuilder.extractSteps(FIXTURE_MARKDOWN, 20, true);
      const optionalSteps = steps.filter(s => s.optional);

      expect(optionalSteps.length).toBe(2);
      expect(optionalSteps[0].optional).toBe(true);
      expect(optionalSteps[0].description).toContain('Run the validation');
      expect(optionalSteps[1].description).toContain('Check the output');
    });

    it('excludes checklist items when includeOptional is false', () => {
      const steps = ExecutionPlanBuilder.extractSteps(FIXTURE_MARKDOWN, 20, false);
      const optionalSteps = steps.filter(s => s.optional);

      expect(optionalSteps.length).toBe(0);
      expect(steps.length).toBe(3);
    });

    it('respects maxSteps limit', () => {
      const steps = ExecutionPlanBuilder.extractSteps(FIXTURE_MARKDOWN, 2, true);

      expect(steps.length).toBe(2);
    });

    it('sets dependsOn to previous step id for sequential numbered steps', () => {
      const steps = ExecutionPlanBuilder.extractSteps(FIXTURE_MARKDOWN, 20, false);

      expect(steps[0].dependsOn).toBeUndefined();
      expect(steps[1].dependsOn).toEqual(['step-1']);
      expect(steps[2].dependsOn).toEqual(['step-2']);
    });

    it('prefixes checklist description with current section name', () => {
      const steps = ExecutionPlanBuilder.extractSteps(FIXTURE_MARKDOWN, 20, true);
      const optionalSteps = steps.filter(s => s.optional);

      expect(optionalSteps[0].description).toContain('[Optional Checks]');
    });

    it('returns empty array for empty markdown', () => {
      const steps = ExecutionPlanBuilder.extractSteps('', 20, true);
      expect(steps.length).toBe(0);
    });

    it('truncates long step names to 60 chars', () => {
      const longText = 'A'.repeat(70);
      const md = `1. ${longText}\n`;
      const steps = ExecutionPlanBuilder.extractSteps(md, 20, false);

      expect(steps[0].name.length).toBe(60);
      expect(steps[0].name.endsWith('…')).toBe(true);
    });
  });
});
