#!/usr/bin/env node
/**
 * skill-updater CLI — run as a launchd job or cron.
 *
 * Usage:
 *   npx tsx /path/to/skill-updater/src/cli.ts
 *   npx tsx /path/to/skill-updater/src/cli.ts --search "browser automation"
 *   npx tsx /path/to/skill-updater/src/cli.ts --log-gaps
 *
 * Environment:
 *   LEARNINGS_DIR   Path to .learnings dir (default: ~/projects/ai-skills/.learnings)
 */

import { createSkillUpdater } from "./index.js";
import { homedir } from "os";
import { join } from "path";

const args = process.argv.slice(2);
const searchQuery = args.includes("--search") ? args[args.indexOf("--search") + 1] : null;
const logGaps = args.includes("--log-gaps");
const topN = parseInt(args[args.indexOf("--top") + 1] ?? "10") || 10;

const INSTALLED = [
  "hybrid-search",
  "triage",
  "capture",
  "ai-router",
  "email-draft",
  "action-items",
  "conversation-memory",
  "channel-formatter",
  "stock-analysis",
  "skill-updater",
];

const LEARNINGS_DIR =
  process.env.LEARNINGS_DIR ??
  join(homedir(), "projects/ai-skills/.learnings");

const updater = createSkillUpdater({
  installedPackages: INSTALLED,
  learningsDir: LEARNINGS_DIR,
  domainKeywords: [
    "knowledge management", "personal assistant", "financial research",
    "investment", "market intelligence", "productivity",
  ],
});

if (searchQuery) {
  const results = await updater.search(searchQuery);
  console.log(`\nSearch results for "${searchQuery}":\n`);
  for (const r of results) {
    console.log(`  [${r.source}] ${r.name}`);
    if (r.description) console.log(`         ${r.description.slice(0, 100)}`);
    console.log(`         ${r.url}`);
  }
} else {
  console.log("Checking for new skills...\n");
  const report = await updater.check();
  console.log(updater.formatReport(report));

  if (logGaps) {
    const logged = await updater.logGaps(report, topN);
    console.log(`\n${logged} new gaps logged to ${LEARNINGS_DIR}/FEATURE_REQUESTS.md`);
  }
}
