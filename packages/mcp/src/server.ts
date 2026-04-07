import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import {
  ExecutionPlanBuilder,
  FileSystemSkillLoader,
  SkillRegistry,
  SkillRuntimeContext,
  SkillValidator,
  loadConfig,
} from '@skillforge/core';

export interface SkillForgeMcpServerOptions {
  skillsBasePath?: string;
  serverName?: string;
  serverVersion?: string;
}

export class SkillForgeMcpServer {
  private readonly server: Server;
  private readonly loader: FileSystemSkillLoader;
  private readonly registry: SkillRegistry;
  private readonly validator: SkillValidator;
  private skillsBasePath: string;
  /** Explicit override from options or env var; undefined means defer to loadConfig() */
  private readonly skillsBasePathOverride: string | undefined;

  constructor(options: SkillForgeMcpServerOptions = {}) {
    this.skillsBasePathOverride =
      options.skillsBasePath ?? process.env['SKILLFORGE_SKILLS_PATH'];

    // Temporary value; overwritten in start() if no override is present
    this.skillsBasePath =
      this.skillsBasePathOverride ?? path.join(process.cwd(), 'skills');

    this.loader = new FileSystemSkillLoader();
    this.registry = SkillRegistry.create();
    this.validator = SkillValidator.create();

    this.server = new Server(
      {
        name: options.serverName ?? 'skillforge',
        version: options.serverVersion ?? '0.1.0',
      },
      {
        capabilities: { tools: {} },
      }
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'skillforge_list':
          return this.handleList();
        case 'skillforge_search':
          return this.handleSearch((args as Record<string, string>)['query'] ?? '');
        case 'skillforge_get':
          return this.handleGet((args as Record<string, string>)['id'] ?? '');
        case 'skillforge_validate':
          return this.handleValidate((args as Record<string, string>)['id'] ?? '');
        case 'skillforge_plan': {
          const planArgs = args as Record<string, unknown>;
          return this.handlePlan(
            (planArgs['id'] as string) ?? '',
            planArgs['maxSteps'] !== undefined ? Number(planArgs['maxSteps']) : undefined,
          );
        }
        case 'skillforge_reload':
          return this.handleReload();
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    });
  }

  private handleList() {
    const skills = this.registry.list();
    const summary = skills.map(s => ({
      id: s.manifest.id,
      name: s.manifest.name,
      version: s.manifest.version,
      description: s.manifest.description,
      category: s.manifest.category,
      tags: s.manifest.tags,
    }));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ skills: summary, total: summary.length }, null, 2),
      }],
    };
  }

  private handleSearch(query: string) {
    const results = this.registry.search(query);
    const summary = results.map(s => ({
      id: s.manifest.id,
      name: s.manifest.name,
      description: s.manifest.description,
      category: s.manifest.category,
      tags: s.manifest.tags,
    }));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ query, results: summary, count: summary.length }, null, 2),
      }],
    };
  }

  private handleGet(id: string) {
    const skill = this.registry.get(id);
    if (!skill) {
      return {
        content: [{ type: 'text', text: `Skill not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          manifest: skill.manifest,
          instructions: skill.instructions,
          path: skill.path,
          examples: skill.examples,
        }, null, 2),
      }],
    };
  }

  private handleValidate(id: string) {
    const skill = this.registry.get(id);
    if (!skill) {
      return {
        content: [{ type: 'text', text: `Skill not found: ${id}` }],
        isError: true,
      };
    }
    const result = this.validator.validate(skill);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }

  private handlePlan(id: string, maxSteps?: number) {
    const skill = this.registry.get(id);
    if (!skill) {
      return {
        content: [{ type: 'text', text: `Skill not found: ${id}` }],
        isError: true,
      };
    }

    // Build a minimal runtime context for plan generation
    const context: SkillRuntimeContext = {
      skill,
      workingDirectory: process.cwd(),
      environment: {},
      availableIntegrations: [],
    };

    const plan = ExecutionPlanBuilder.build(skill, context, { maxSteps: maxSteps ?? 20 });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          skillId: skill.manifest.id,
          skillName: skill.manifest.name,
          estimatedDurationMs: plan.estimatedDurationMs,
          stepCount: plan.steps.length,
          steps: plan.steps.map(step => ({
            id: step.id,
            name: step.name,
            description: step.description,
            dependsOn: step.dependsOn,
            tools: step.tools,
            optional: step.optional ?? false,
          })),
        }, null, 2),
      }],
    };
  }

  private async handleReload() {
    try {
      this.registry.clear();
      const skills = await this.loader.loadAll(this.skillsBasePath);
      for (const skill of skills) {
        this.registry.registerOrUpdate(skill);
      }
      const skillIds = this.registry.list().map(s => s.manifest.id);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ reloaded: skillIds.length, skills: skillIds }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: `Failed to reload skills: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }

  async start(): Promise<void> {
    // Resolve skillsBasePath: explicit override takes priority, then loadConfig()
    if (this.skillsBasePathOverride !== undefined) {
      this.skillsBasePath = this.skillsBasePathOverride;
    } else {
      const config = await loadConfig(process.cwd());
      this.skillsBasePath = config.skillsPath;
    }

    console.error(`[SkillForge MCP] Loading skills from: ${this.skillsBasePath}`);
    try {
      const skills = await this.loader.loadAll(this.skillsBasePath);
      for (const skill of skills) {
        this.registry.registerOrUpdate(skill);
      }
      const stats = this.registry.stats();
      console.error(`[SkillForge MCP] Loaded ${stats.total} skills`);
    } catch (err) {
      console.error(`[SkillForge MCP] Warning: Could not load skills from ${this.skillsBasePath}:`, err);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[SkillForge MCP] Server running on stdio');
  }
}

const TOOLS: Tool[] = [
  {
    name: 'skillforge_list',
    description: 'List all available SkillForge skills with their metadata (id, name, description, category, tags)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'skillforge_search',
    description: 'Search SkillForge skills by query string. Matches against skill names, descriptions, and tags.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to match against skill names, descriptions, and tags',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'skillforge_get',
    description: 'Get the full details of a skill by its ID, including the complete instructions (SKILL.md content)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The skill ID to retrieve',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'skillforge_validate',
    description: 'Validate a skill by ID and return any errors or warnings',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The skill ID to validate',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'skillforge_plan',
    description: "Build a structured execution plan for a skill. Returns an ordered list of steps extracted from the skill's SKILL.md instructions. Use this to understand the workflow before executing a skill, or to guide step-by-step execution.",
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The skill ID to build a plan for',
        },
        maxSteps: {
          type: 'number',
          description: 'Maximum number of steps to extract (default: 20)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'skillforge_reload',
    description: 'Reload all skills from the skills directory without restarting the MCP server. Returns the count and IDs of reloaded skills.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
