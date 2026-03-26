/**
 * AutoResearch CLI (P3-01)
 *
 * Entry point for the AutoResearch loop.
 *
 * Usage:
 *   skillforge autoResearch start   — run experiments until stopped or max reached
 *   skillforge autoResearch stop    — write a stop-file so a running loop halts
 *   skillforge autoResearch status  — show last run summary from DB
 *   skillforge autoResearch report  — print the latest report file path
 *
 * Configuration is read from program.md (JSON frontmatter block).
 * Falls back to safe defaults when program.md is absent.
 *
 * Environment variables required to actually call LLMs:
 *   CF_ACCOUNT_ID, CF_GATEWAY_NAME, CF_API_TOKEN  (Cloudflare AI Gateway)
 *   CF_KEY_VAULT_REF                               (Key Vault reference for provider keys)
 *
 * If env vars are missing the CLI starts in DRY_RUN mode and skips LLM calls.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { initDb, getDb, persistDb } from "../db/database.js";
import { pickSkillCandidate, runExperiment, type EvalTaskSpec } from "./experimentRunner.js";
import { applyExperimentOutcome } from "./skillUpdater.js";
import { generateReport, type RunSummary } from "./reportGenerator.js";
import { logger } from "../utils/logger.js";

// ─── Stop-file path ───────────────────────────────────────────────────────────
// A running loop checks for this file every iteration and halts if found.
const STOP_FILE = resolve("./.autoresearch-stop");

// ─── Program.md schema ────────────────────────────────────────────────────────

const ProgramConfigSchema = z.object({
  maxExperimentsPerRun: z.number().int().positive().default(5),
  scoreThreshold: z.number().min(0).max(1).default(0.8),
  minImprovementDelta: z.number().min(0).max(1).default(0.05),
  confidenceThreshold: z.number().min(0).max(1).default(0.05),
  keyVaultRef: z.string().default("vault:anthropic-key"),
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  taskModel: z.string().default("claude-haiku-4-5-20251001"),
  judgeModel: z.string().default("claude-sonnet-4-6"),
  scorerWeights: z.object({
    judgeScore: z.number().default(0.60),
    tokenEfficiency: z.number().default(0.25),
    latency: z.number().default(0.15),
  }).optional(),
  evalTasks: z.array(
    z.object({
      prompt: z.string().min(1),
      expectedOutcome: z.string().optional(),
      domain: z.string().optional(),
    })
  ).default([]),
});

type ProgramConfig = z.infer<typeof ProgramConfigSchema>;

// ─── program.md parser ────────────────────────────────────────────────────────

/**
 * Read program.md and extract the JSON config block.
 * Looks for a ```json ... ``` block with the config.
 * Falls back to safe defaults if not found.
 */
function loadProgramConfig(programPath = "./program.md"): ProgramConfig {
  const defaults = ProgramConfigSchema.parse({});

  if (!existsSync(programPath)) {
    logger.warn("AutoResearch: program.md not found, using defaults", { programPath });
    return defaults;
  }

  const content = readFileSync(programPath, "utf-8");

  // Extract JSON from ```json ... ``` block
  const jsonMatch = content.match(/```json\s*\n([\s\S]*?)```/m);
  if (!jsonMatch?.[1]) {
    logger.warn("AutoResearch: no JSON config block in program.md, using defaults");
    return defaults;
  }

  try {
    const raw: unknown = JSON.parse(jsonMatch[1]);
    const result = ProgramConfigSchema.safeParse(raw);
    if (!result.success) {
      logger.warn("AutoResearch: invalid program.md config, using defaults", {
        issues: result.error.issues,
      });
      return defaults;
    }
    logger.info("AutoResearch: loaded config from program.md");
    return result.data;
  } catch (err) {
    logger.warn("AutoResearch: could not parse program.md JSON block, using defaults", { err });
    return defaults;
  }
}

// ─── eval.md parser ───────────────────────────────────────────────────────────

/**
 * Load eval tasks from eval.md.
 * Parses ## Task N sections and extracts Prompt / Expected blocks.
 */
function loadEvalTasks(evalPath = "./eval.md"): EvalTaskSpec[] {
  if (!existsSync(evalPath)) {
    logger.warn("AutoResearch: eval.md not found, no eval tasks loaded", { evalPath });
    return [];
  }

  const content = readFileSync(evalPath, "utf-8");
  const tasks: EvalTaskSpec[] = [];

  // Split on ## Task headers
  const taskBlocks = content.split(/^##\s+Task\s+\d+/m).slice(1);

  for (const block of taskBlocks) {
    const promptMatch = block.match(/\*\*Prompt:\*\*\s*\n```\s*\n([\s\S]*?)```/m);
    const expectedMatch = block.match(/\*\*Expected:\*\*\s*\n```\s*\n([\s\S]*?)```/m);
    const domainMatch = block.match(/\*\*Domain:\*\*\s*(.+)/);

    if (promptMatch?.[1]) {
      tasks.push({
        prompt: promptMatch[1].trim(),
        expectedOutcome: expectedMatch?.[1]?.trim(),
        domain: domainMatch?.[1]?.trim(),
      });
    }
  }

  logger.info("AutoResearch: loaded eval tasks", { count: tasks.length });
  return tasks;
}

// ─── Run loop ─────────────────────────────────────────────────────────────────

async function startLoop(config: ProgramConfig, evalTasks: EvalTaskSpec[]): Promise<void> {
  // Check if running in DRY_RUN mode (missing env vars)
  const dryRun =
    !process.env["CF_ACCOUNT_ID"] ||
    !process.env["CF_GATEWAY_NAME"] ||
    !process.env["CF_API_TOKEN"];

  if (dryRun) {
    logger.warn("AutoResearch: DRY RUN — env vars missing, LLM calls will be skipped");
    logger.warn("AutoResearch: set CF_ACCOUNT_ID, CF_GATEWAY_NAME, CF_API_TOKEN to enable");
  }

  await initDb(process.env["DB_PATH"] ?? "./data/skillforge.db");

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const db = getDb();

  db.run(
    `INSERT INTO autoresearch_runs (id, started_at, status)
     VALUES (?, ?, 'running')`,
    [runId, startedAt]
  );
  persistDb();

  logger.info("AutoResearch: run started", {
    runId,
    maxExperiments: config.maxExperimentsPerRun,
    dryRun,
  });

  const results: RunSummary["results"] = [];
  let experimentsRan = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;

  // Clean up any lingering stop file from a previous session
  if (existsSync(STOP_FILE)) {
    unlinkSync(STOP_FILE);
  }

  // Graceful stop on SIGTERM / SIGINT
  let stopping = false;
  const handleStop = (): void => {
    stopping = true;
    logger.info("AutoResearch: stop signal received, finishing current experiment...");
  };
  process.on("SIGTERM", handleStop);
  process.on("SIGINT", handleStop);

  while (experimentsRan < config.maxExperimentsPerRun && !stopping) {
    // Check for stop file (written by `skillforge autoResearch stop`)
    if (existsSync(STOP_FILE)) {
      logger.info("AutoResearch: stop file detected, halting loop");
      unlinkSync(STOP_FILE);
      stopping = true;
      break;
    }

    const candidate = pickSkillCandidate(config.scoreThreshold, 10);
    if (!candidate) {
      logger.info("AutoResearch: no more skill candidates below threshold", {
        threshold: config.scoreThreshold,
      });
      break;
    }

    const tasksForRun: EvalTaskSpec[] =
      evalTasks.length > 0
        ? evalTasks.slice(0, 3) // use up to 3 tasks per experiment
        : [
            {
              prompt: `Explain and demonstrate how to apply the skill "${candidate.name}" to a real problem.`,
              expectedOutcome:
                "A clear, actionable explanation with a concrete example of applying the skill.",
            },
          ];

    if (dryRun) {
      // In dry-run mode, simulate an experiment without calling LLMs
      logger.info("AutoResearch: DRY RUN — simulating experiment", {
        skillId: candidate.id,
        skillName: candidate.name,
      });

      const simulatedResult = {
        id: randomUUID(),
        runId,
        skillId: candidate.id,
        strategy: "prompt-restructure" as const,
        variantContent: `# ${candidate.name} (dry-run variant)\n\n${candidate.content}`,
        scorerResult: {
          compositeDelta: 0,
          dimensions: { judgeScoreDelta: 0, tokenDelta: 0, latencyDelta: 0 },
          confidence: 0,
          winner: "tie" as const,
        },
        aggregated: { avgDelta: 0, winRate: 0, dominantWinner: "tie" as const },
        promoted: false,
        ranAt: new Date().toISOString(),
      };

      const updateResult = applyExperimentOutcome(simulatedResult);
      results.push({ experiment: simulatedResult, update: updateResult });
      ties++;
    } else {
      try {
        const experiment = await runExperiment(candidate, tasksForRun, {
          runId,
          keyVaultRef: config.keyVaultRef,
          provider: config.provider,
          taskModel: config.taskModel,
          judgeModel: config.judgeModel,
          scorerWeights: config.scorerWeights,
          maxTokens: 1024,
        });

        const updateResult = applyExperimentOutcome(experiment);
        results.push({ experiment, update: updateResult });

        if (updateResult.outcome === "promoted") wins++;
        else if (updateResult.outcome === "discarded") losses++;
        else ties++;
      } catch (err) {
        logger.error("AutoResearch: experiment failed", {
          skillId: candidate.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    experimentsRan++;

    // Update run progress in DB
    db.run(
      `UPDATE autoresearch_runs
       SET experiments = ?, wins = ?, losses = ?
       WHERE id = ?`,
      [experimentsRan, wins, losses, runId]
    );
    persistDb();
  }

  process.off("SIGTERM", handleStop);
  process.off("SIGINT", handleStop);

  const stoppedAt = new Date().toISOString();
  db.run(
    `UPDATE autoresearch_runs
     SET status = 'completed', stopped_at = ?, experiments = ?, wins = ?, losses = ?
     WHERE id = ?`,
    [stoppedAt, experimentsRan, wins, losses, runId]
  );
  persistDb();

  // Generate nightly report
  const summary: RunSummary = {
    runId,
    startedAt,
    stoppedAt,
    experimentsRan,
    wins,
    losses,
    ties,
    results,
  };

  const reportPath = generateReport(summary);

  logger.info("AutoResearch: run complete", {
    runId,
    experimentsRan,
    wins,
    losses,
    ties,
    reportPath,
  });

  process.stdout.write(
    `\nAutoResearch run complete.\n` +
      `  Experiments: ${experimentsRan}\n` +
      `  Promoted:    ${wins}\n` +
      `  Discarded:   ${losses}\n` +
      `  Inconclusive:${ties}\n` +
      `  Report:      ${reportPath}\n\n`
  );
}

// ─── Status ───────────────────────────────────────────────────────────────────

async function showStatus(): Promise<void> {
  await initDb(process.env["DB_PATH"] ?? "./data/skillforge.db");
  const db = getDb();

  const result = db.exec(
    `SELECT id, started_at, stopped_at, status, experiments, wins, losses, report_path
     FROM autoresearch_runs
     ORDER BY started_at DESC
     LIMIT 5`
  );

  if (!result[0]?.values.length) {
    process.stdout.write("No AutoResearch runs found.\n");
    return;
  }

  process.stdout.write("=== Recent AutoResearch Runs ===\n\n");
  for (const row of result[0].values) {
    process.stdout.write(
      `Run: ${row[0]}\n` +
        `  Started:  ${row[1]}\n` +
        `  Stopped:  ${row[2] ?? "(running)"}\n` +
        `  Status:   ${row[3]}\n` +
        `  Results:  ${row[4]} experiments, ${row[5]} promoted, ${row[6]} discarded\n` +
        `  Report:   ${row[7] ?? "(none)"}\n\n`
    );
  }
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

function writeStopFile(): void {
  writeFileSync(STOP_FILE, new Date().toISOString(), "utf-8");
  process.stdout.write("Stop file written. Running loop will halt after current experiment.\n");
}

// ─── Report ───────────────────────────────────────────────────────────────────

async function showReport(): Promise<void> {
  await initDb(process.env["DB_PATH"] ?? "./data/skillforge.db");
  const db = getDb();

  const result = db.exec(
    `SELECT report_path FROM autoresearch_runs
     WHERE report_path IS NOT NULL
     ORDER BY started_at DESC
     LIMIT 1`
  );

  const path = result[0]?.values[0]?.[0];
  if (!path || typeof path !== "string") {
    process.stdout.write("No report found. Run `autoResearch start` first.\n");
    return;
  }

  if (existsSync(path)) {
    const content = readFileSync(path, "utf-8");
    process.stdout.write(content + "\n");
  } else {
    process.stdout.write(`Report path recorded but file not found: ${path}\n`);
  }
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(
      "SkillForge AutoResearch CLI\n\n" +
        "Usage:\n" +
        "  skillforge autoResearch start    Run experiments until stopped or max reached\n" +
        "  skillforge autoResearch stop     Halt a running loop (writes stop file)\n" +
        "  skillforge autoResearch status   Show last 5 run summaries\n" +
        "  skillforge autoResearch report   Print the latest report\n\n" +
        "Config: edit program.md to change experiment parameters\n" +
        "Eval tasks: edit eval.md to change benchmark tasks\n\n" +
        "Required env vars (for live LLM calls):\n" +
        "  CF_ACCOUNT_ID, CF_GATEWAY_NAME, CF_API_TOKEN, CF_KEY_VAULT_REF\n"
    );
    return;
  }

  switch (command) {
    case "start": {
      const config = loadProgramConfig();
      const evalTasks = loadEvalTasks();

      // Merge eval tasks from program.md config with eval.md tasks
      const allTasks = evalTasks.length > 0 ? evalTasks : config.evalTasks;

      await startLoop(config, allTasks);
      break;
    }
    case "stop":
      writeStopFile();
      break;
    case "status":
      await showStatus();
      break;
    case "report":
      await showReport();
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\nRun with --help for usage.\n`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  logger.error("AutoResearch CLI fatal error", { err });
  process.exit(1);
});
