import { describe, it, expect } from 'vitest';
import { loadConfig, loadConfigSync } from '../config';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';

describe('loadConfigSync', () => {
  it('returns defaults when no env vars set', () => {
    const result = loadConfigSync('/tmp/test');
    expect(result.skillsPath).toBe('/tmp/test/skills');
    expect(result.defaultLicense).toBe('MIT');
    expect(result.configFilePath).toBeNull();
  });

  it('uses SKILLFORGE_SKILLS_PATH env var', () => {
    process.env['SKILLFORGE_SKILLS_PATH'] = '/custom/skills';
    const result = loadConfigSync();
    expect(result.skillsPath).toBe('/custom/skills');
    delete process.env['SKILLFORGE_SKILLS_PATH'];
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config file found', async () => {
    const result = await loadConfig('/tmp');
    expect(result.skillsPath).toBeDefined();
    expect(result.defaultLicense).toBe('MIT');
  });

  it('loads skillforge.config.json from directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-test-'));
    try {
      const configPath = path.join(tmpDir, 'skillforge.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        skillsPath: '/my/custom/skills',
        defaultAuthor: 'test-author',
      }));
      const result = await loadConfig(tmpDir);
      expect(result.skillsPath).toBe('/my/custom/skills');
      expect(result.defaultAuthor).toBe('test-author');
      expect(result.configFilePath).toBe(configPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it('finds config file in parent directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-test-'));
    try {
      // Config in parent, start from child
      const childDir = path.join(tmpDir, 'child', 'grandchild');
      await fs.mkdir(childDir, { recursive: true });
      const configPath = path.join(tmpDir, 'skillforge.config.json');
      await fs.writeFile(configPath, JSON.stringify({ defaultAuthor: 'parent-author' }));
      const result = await loadConfig(childDir);
      expect(result.defaultAuthor).toBe('parent-author');
      expect(result.configFilePath).toBe(configPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });
});
