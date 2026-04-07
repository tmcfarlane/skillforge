import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { execSync } from 'child_process';

const CLI_PATH = path.resolve(__dirname, '../../dist/cli.js');

describe('skillforge new', () => {
  it('creates manifest.json with correct fields', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    try {
      execSync(`node ${CLI_PATH} new test-skill --output-dir ${tmpDir}`, { stdio: 'pipe' });
      const manifest = JSON.parse(
        await fs.readFile(path.join(tmpDir, 'test-skill', 'manifest.json'), 'utf-8')
      );
      expect(manifest.id).toBe('test-skill');
      expect(manifest.name).toBe('Test Skill');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.license).toBe('MIT');
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it('creates SKILL.md with template content', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    try {
      execSync(`node ${CLI_PATH} new test-skill --output-dir ${tmpDir}`, { stdio: 'pipe' });
      const content = await fs.readFile(
        path.join(tmpDir, 'test-skill', 'SKILL.md'), 'utf-8'
      );
      expect(content).toContain('## When to Use This Skill');
      expect(content).toContain('## Process');
      expect(content).toContain('## Guardrails');
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it('rejects invalid id with exit code 1', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} new Bad_ID`, { stdio: 'pipe' });
    }).toThrow(); // non-zero exit
  });

  it('rejects duplicate skill directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    try {
      execSync(`node ${CLI_PATH} new dupe-skill --output-dir ${tmpDir}`, { stdio: 'pipe' });
      expect(() => {
        execSync(`node ${CLI_PATH} new dupe-skill --output-dir ${tmpDir}`, { stdio: 'pipe' });
      }).toThrow(); // non-zero exit on duplicate
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it('respects --category option', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    try {
      execSync(`node ${CLI_PATH} new cat-skill --category tool_guide --output-dir ${tmpDir}`, { stdio: 'pipe' });
      const manifest = JSON.parse(
        await fs.readFile(path.join(tmpDir, 'cat-skill', 'manifest.json'), 'utf-8')
      );
      expect(manifest.category).toBe('tool_guide');
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });
});
