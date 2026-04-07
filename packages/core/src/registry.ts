import { ISkillRegistry, Skill, SkillCategory, SkillId, RegistryStats } from './types';
import { SkillNotFoundError, SkillAlreadyRegisteredError } from './errors';

export class SkillRegistry implements ISkillRegistry {
  private readonly skills = new Map<SkillId, Skill>();

  static create(): SkillRegistry {
    return new SkillRegistry();
  }

  register(skill: Skill): void {
    if (this.skills.has(skill.manifest.id)) {
      throw new SkillAlreadyRegisteredError(skill.manifest.id);
    }
    this.skills.set(skill.manifest.id, skill);
  }

  registerOrUpdate(skill: Skill): void {
    this.skills.set(skill.manifest.id, skill);
  }

  get(id: SkillId): Skill | undefined {
    return this.skills.get(id);
  }

  getOrThrow(id: SkillId): Skill {
    const skill = this.skills.get(id);
    if (!skill) throw new SkillNotFoundError(id);
    return skill;
  }

  search(query: string): Skill[] {
    if (!query.trim()) return this.list();
    const q = query.toLowerCase();
    return this.list().filter(skill => {
      const { id, name, description, tags } = skill.manifest;
      return (
        id.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        description.toLowerCase().includes(q) ||
        tags.some(tag => tag.toLowerCase().includes(q))
      );
    });
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  byCategory(category: SkillCategory): Skill[] {
    return this.list().filter(s => s.manifest.category === category);
  }

  byTags(tags: string[]): Skill[] {
    if (tags.length === 0) return this.list();
    return this.list().filter(s =>
      tags.every(tag => s.manifest.tags.includes(tag))
    );
  }

  clear(): void {
    this.skills.clear();
  }

  stats(): RegistryStats {
    const all = this.list();
    const byCategory: Record<string, number> = {};
    const tagSet = new Set<string>();

    for (const skill of all) {
      const cat = skill.manifest.category;
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      for (const tag of skill.manifest.tags) tagSet.add(tag);
    }

    return {
      total: all.length,
      byCategory,
      tags: Array.from(tagSet).sort(),
    };
  }
}
