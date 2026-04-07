#!/usr/bin/env node
/**
 * @skillforge/mcp — MCP server for Claude Desktop
 *
 * Run directly: node dist/index.js
 * Or via bin: skillforge-mcp
 *
 * Configure via environment:
 *   SKILLFORGE_SKILLS_PATH — path to skills directory (default: ./skills)
 */

import { SkillForgeMcpServer } from './server';

export { SkillForgeMcpServer } from './server';
export type { SkillForgeMcpServerOptions } from './server';

// Start when run directly (not imported as library)
if (require.main === module) {
  const server = new SkillForgeMcpServer();
  server.start().catch((err) => {
    console.error('[SkillForge MCP] Fatal error:', err);
    process.exit(1);
  });
}
