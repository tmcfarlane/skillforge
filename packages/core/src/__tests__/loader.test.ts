import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { FileSystemSkillLoader } from '../loader';
import { SkillLoadError } from '../errors';
import { SkillRegistry } from '../registry';
import { Skill, SkillCategory } from '../types';

const SKILLS_DIR = path.resolve(__dirname, '../../../..', 'skills');

describe('FileSystemSkillLoader', () => {
  const loader = new FileSystemSkillLoader();

  describe('discover()', () => {
    it('returns at least 3 skill paths for the real skills directory', async () => {
      const paths = await loader.discover(SKILLS_DIR);
      expect(paths.length).toBeGreaterThanOrEqual(3);
    });

    it('returned paths contain the expected skill directories', async () => {
      const paths = await loader.discover(SKILLS_DIR);
      const names = paths.map(p => path.basename(p)).sort();
      expect(names).toContain('code-review');
      expect(names).toContain('deep-research');
      expect(names).toContain('git-workflow');
    });
  });

  describe('load()', () => {
    it('loads code-review skill with correct manifest.id', async () => {
      const skillPath = path.join(SKILLS_DIR, 'code-review');
      const skill = await loader.load(skillPath);
      expect(skill.manifest.id).toBe('code-review');
      expect(skill.manifest.name).toBe('Code Review');
      expect(skill.instructions).toBeTruthy();
      expect(skill.path).toBe(path.resolve(skillPath));
    });

    it('loads deep-research skill with correct manifest.id', async () => {
      const skillPath = path.join(SKILLS_DIR, 'deep-research');
      const skill = await loader.load(skillPath);
      expect(skill.manifest.id).toBe('deep-research');
    });

    it('loads git-workflow skill with correct manifest.id', async () => {
      const skillPath = path.join(SKILLS_DIR, 'git-workflow');
      const skill = await loader.load(skillPath);
      expect(skill.manifest.id).toBe('git-workflow');
    });

    it('throws SkillLoadError on a non-existent path', async () => {
      await expect(loader.load('/nonexistent/path/to/skill')).rejects.toThrow(SkillLoadError);
    });

    it('throws SkillLoadError on a directory missing manifest.json', async () => {
      // Use a real directory that has no manifest.json — the SKILLS_DIR itself
      // has no manifest.json at its root (only subdirs do)
      await expect(loader.load(SKILLS_DIR)).rejects.toThrow(SkillLoadError);
    });
  });

  describe('loadAll()', () => {
    it('loads at least 3 skills from the skills directory', async () => {
      const skills = await loader.loadAll(SKILLS_DIR);
      expect(skills.length).toBeGreaterThanOrEqual(3);
    });

    it('each loaded skill has a valid manifest and non-empty instructions', async () => {
      const skills = await loader.loadAll(SKILLS_DIR);
      for (const skill of skills) {
        expect(skill.manifest.id).toBeTruthy();
        expect(skill.manifest.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(skill.instructions.trim().length).toBeGreaterThan(0);
      }
    });

    it('returned skill ids include all three expected skills', async () => {
      const skills = await loader.loadAll(SKILLS_DIR);
      const ids = skills.map(s => s.manifest.id);
      expect(ids).toContain('code-review');
      expect(ids).toContain('deep-research');
      expect(ids).toContain('git-workflow');
    });
  });

  describe('frontmatter-based loading', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('discovers a skill dir that has only SKILL.md with frontmatter', async () => {
      const skillDir = path.join(tmpDir, 'my-fm-skill');
      await fs.mkdir(skillDir);
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: My FM Skill\ndescription: A frontmatter skill\n---\n\n# My FM Skill\nDoes things.\n',
      );
      const paths = await loader.discover(tmpDir);
      expect(paths.map(p => path.basename(p))).toContain('my-fm-skill');
    });

    it('loads a frontmatter-only skill with manifest derived from frontmatter', async () => {
      const skillDir = path.join(tmpDir, 'fm-skill');
      await fs.mkdir(skillDir);
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: FM Skill\ndescription: Does something useful\ntags: [research, analysis]\ncategory: workflow\nversion: 2.1.0\nauthor: tester\n---\n\n# FM Skill\nBody content here.\n',
      );
      const skill = await loader.load(skillDir);
      expect(skill.manifest.id).toBe('fm-skill');
      expect(skill.manifest.name).toBe('FM Skill');
      expect(skill.manifest.version).toBe('2.1.0');
      expect(skill.manifest.description).toBe('Does something useful');
      expect(skill.manifest.tags).toEqual(['research', 'analysis']);
      expect(skill.manifest.author).toBe('tester');
    });

    it('strips the frontmatter block from instructions', async () => {
      const skillDir = path.join(tmpDir, 'strip-skill');
      await fs.mkdir(skillDir);
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Strip Skill\n---\n\n# Strip Skill\nActual instructions here.\n',
      );
      const skill = await loader.load(skillDir);
      expect(skill.instructions).not.toContain('---');
      expect(skill.instructions).toContain('# Strip Skill');
      expect(skill.instructions).toContain('Actual instructions here.');
    });

    it('does NOT discover a skill dir with SKILL.md that has no frontmatter', async () => {
      const skillDir = path.join(tmpDir, 'no-fm-skill');
      await fs.mkdir(skillDir);
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '# No Frontmatter\nThis skill has no YAML frontmatter block.\n',
      );
      const paths = await loader.discover(tmpDir);
      expect(paths.map(p => path.basename(p))).not.toContain('no-fm-skill');
    });
  });

  describe('resolveRequirements()', () => {
    const makeSkill = (requires?: string[]): Skill => ({
      manifest: {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        description: 'A test skill',
        category: SkillCategory.WORKFLOW,
        tags: [],
        requires,
      },
      instructions: '# Test',
      path: '/fake/path',
    });

    it('returns empty array when no dependencies declared', () => {
      const registry = SkillRegistry.create();
      const skill = makeSkill(undefined);
      const missing = loader.resolveRequirements(skill, registry);
      expect(missing).toEqual([]);
    });

    it('returns empty array when requires is an empty array', () => {
      const registry = SkillRegistry.create();
      const skill = makeSkill([]);
      const missing = loader.resolveRequirements(skill, registry);
      expect(missing).toEqual([]);
    });

    it('returns missing skill ids when required skills are not in registry', () => {
      const registry = SkillRegistry.create();
      const skill = makeSkill(['git-workflow', 'code-review']);
      const missing = loader.resolveRequirements(skill, registry);
      expect(missing).toEqual(['git-workflow', 'code-review']);
    });

    it('returns only truly missing ids when some required skills are registered', () => {
      const registry = SkillRegistry.create();
      const depSkill = makeSkill(undefined);
      const registered: Skill = { ...depSkill, manifest: { ...depSkill.manifest, id: 'git-workflow' } };
      registry.register(registered);
      const skill = makeSkill(['git-workflow', 'code-review']);
      const missing = loader.resolveRequirements(skill, registry);
      expect(missing).toEqual(['code-review']);
    });

    it('returns empty array when all required skills are registered', () => {
      const registry = SkillRegistry.create();
      const dep1: Skill = { ...makeSkill(undefined), manifest: { ...makeSkill(undefined).manifest, id: 'git-workflow' } };
      const dep2: Skill = { ...makeSkill(undefined), manifest: { ...makeSkill(undefined).manifest, id: 'code-review' } };
      registry.register(dep1);
      registry.register(dep2);
      const skill = makeSkill(['git-workflow', 'code-review']);
      const missing = loader.resolveRequirements(skill, registry);
      expect(missing).toEqual([]);
    });
  });
});
