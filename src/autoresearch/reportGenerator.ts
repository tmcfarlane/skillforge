/**
 * Nightly Report Generator (P3-05)
 *
 * Produces a markdown report summarizing one AutoResearch run:
 *   - What skills were tested
 *   - What variant strategies were tried
 *   - What changed (wins/losses/ties)
 *   - Performance deltas (tokens saved, score improvements, latency changes)
 *
 * Saves to reports/YYYY-MM-DD.md (one file per calendar day, appends if run multiple times).
 * Also updates the autoresearch_runs table with report_path.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";
import { type UpdateResult } from "./skillUpdater.js";
import { type ExperimentResult } from "./experimentRunner.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RunSummary {
  runId: string;
  startedAt: string;
  stoppedAt: string;
  experimentsRan: number;
  wins: number;
  losses: number;
  ties: number;
  results: Array<{
    experiment: ExperimentResult;
    update: UpdateResult;
  }>;
}

// ─── Report directory ─────────────────────────────────────────────────────────

const REPORTS_DIR = "./reports";

function ensureReportsDir(): void {
  const dir = resolve(REPORTS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getReportPath(date: Date): string {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return resolve(join(REPORTS_DIR, `${dateStr}.md`));
}

// ─── Markdown builders ────────────────────────────────────────────────────────

function formatDelta(delta: number, unit = ""): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(3)}${unit}`;
}

function outcomeEmoji(outcome: UpdateResult["outcome"]): string {
  switch (outcome) {
    case "promoted":
      return "✅";
    case "discarded":
      return "❌";
    case "inconclusive":
      return "⚠️";
  }
}

function buildExperimentSection(
  experiment: ExperimentResult,
  update: UpdateResult,
  idx: number
): string {
  const { strategy, aggregated, scorerResult, skillId } = experiment;
  const { outcome, previousScore, newScore, reason } = update;

  const db = getDb();
  const nameResult = db.exec("SELECT name FROM skills WHERE id = ?", [skillId]);
  const skillName = (nameResult[0]?.values[0]?.[0] as string | undefined) ?? skillId;

  const lines: string[] = [
    `### ${idx + 1}. ${skillName} — \`${strategy}\` ${outcomeEmoji(outcome)}`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Outcome | **${outcome}** |`,
    `| Judge Score Delta | ${formatDelta(scorerResult.dimensions.judgeScoreDelta)} |`,
    `| Token Delta | ${formatDelta(scorerResult.dimensions.tokenDelta, " tokens")} |`,
    `| Latency Delta | ${formatDelta(scorerResult.dimensions.latencyDelta, " ms")} |`,
    `| Composite Delta | ${formatDelta(aggregated.avgDelta)} |`,
    `| Win Rate | ${(aggregated.winRate * 100).toFixed(0)}% |`,
    `| Confidence | ${(scorerResult.confidence * 100).toFixed(0)}% |`,
    `| Score Change | ${previousScore.toFixed(3)} → ${newScore.toFixed(3)} |`,
    "",
    `**Reason:** ${reason}`,
    "",
  ];

  if (outcome === "promoted") {
    lines.push("**Variant preview (first 400 chars):**", "");
    lines.push("```");
    lines.push(experiment.variantContent.slice(0, 400));
    if (experiment.variantContent.length > 400) lines.push("...");
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function buildReport(summary: RunSummary): string {
  const date = new Date(summary.startedAt);
  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = date.toISOString().slice(11, 19);

  const totalTokenDelta = summary.results.reduce(
    (sum, { experiment }) => sum + experiment.scorerResult.dimensions.tokenDelta,
    0
  );
  const avgScoreDelta =
    summary.results.length > 0
      ? summary.results.reduce((sum, { experiment }) => sum + experiment.aggregated.avgDelta, 0) /
        summary.results.length
      : 0;

  const header = [
    `# AutoResearch Report — ${dateStr}`,
    "",
    `> Run ID: \`${summary.runId}\`  `,
    `> Started: ${summary.startedAt}  `,
    `> Stopped: ${summary.stoppedAt}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Experiments ran | ${summary.experimentsRan} |`,
    `| Variants promoted | ${summary.wins} ✅ |`,
    `| Originals retained | ${summary.losses} ❌ |`,
    `| Inconclusive | ${summary.ties} ⚠️ |`,
    `| Avg score delta | ${formatDelta(avgScoreDelta)} |`,
    `| Total token delta | ${formatDelta(totalTokenDelta, " tokens")} |`,
    "",
  ].join("\n");

  if (summary.results.length === 0) {
    return header + "## Experiments\n\n_No experiments ran in this session._\n";
  }

  const experimentSections = summary.results
    .map(({ experiment, update }, idx) => buildExperimentSection(experiment, update, idx))
    .join("\n");

  const footer = [
    "## What to Try Next",
    "",
    "- Skills with `inconclusive` results: try a different strategy",
    "- Skills with `discarded` results: review if eval tasks are representative",
    "- Skills promoted: monitor usage_count and judge_scores for regression",
    "",
    "---",
    `_Generated by SkillForge AutoResearch at ${timeStr} UTC_`,
    "",
  ].join("\n");

  return `${header}## Experiments\n\n${experimentSections}\n${footer}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate and save the nightly report for a completed AutoResearch run.
 * Appends to the day's report file if it already exists (multiple runs per day).
 */
export function generateReport(summary: RunSummary): string {
  ensureReportsDir();

  const date = new Date(summary.startedAt);
  const reportPath = getReportPath(date);
  const content = buildReport(summary);

  let finalContent = content;
  if (existsSync(reportPath)) {
    // Append to existing day report with a divider
    const existing = readFileSync(reportPath, "utf-8");
    finalContent = `${existing}\n---\n\n${content}`;
  }

  writeFileSync(reportPath, finalContent, "utf-8");

  // Update run record with report path
  const db = getDb();
  db.run(
    `UPDATE autoresearch_runs SET report_path = ? WHERE id = ?`,
    [reportPath, summary.runId]
  );
  persistDb();

  logger.info("ReportGenerator: report written", {
    runId: summary.runId,
    path: reportPath,
    experiments: summary.experimentsRan,
    wins: summary.wins,
  });

  return reportPath;
}

/**
 * Load all runs from DB for a given date range.
 */
export function getRunSummaries(
  afterDate?: string
): Array<{ id: string; startedAt: string; status: string; experiments: number; wins: number }> {
  const db = getDb();
  const result = db.exec(
    `SELECT id, started_at, status, experiments, wins
     FROM autoresearch_runs
     WHERE started_at >= ?
     ORDER BY started_at DESC
     LIMIT 50`,
    [afterDate ?? "2000-01-01"]
  );

  if (!result[0]) return [];

  return result[0].values.map((row) => ({
    id: row[0] as string,
    startedAt: row[1] as string,
    status: row[2] as string,
    experiments: row[3] as number,
    wins: row[4] as number,
  }));
}
