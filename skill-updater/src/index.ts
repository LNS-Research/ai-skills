/**
 * @lns-skills/skill-updater
 *
 * Monitors OpenClaw skills, Smithery MCP registry, and GitHub MCP servers list
 * for new capabilities. Compares against installed @lns-skills packages and
 * outputs a gap report. Can log gaps directly to .learnings/FEATURE_REQUESTS.md.
 *
 * Usage:
 *   import { createSkillUpdater } from "@lns-skills/skill-updater";
 *
 *   const updater = createSkillUpdater({
 *     installedPackages: ["hybrid-search", "triage", "stock-analysis"],
 *     learningSdir: "/path/to/.learnings",
 *   });
 *   const report = await updater.check();
 *   await updater.logGaps(report);
 */

export type { SkillEntry, McpServerEntry } from "./sources.js";
export { listOpenClawSkillNames, fetchSmitheryServers, fetchGithubMcpServers, searchSmithery } from "./sources.js";

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { listOpenClawSkillNames, fetchSmitheryServers, fetchGithubMcpServers, searchSmithery } from "./sources.js";
import type { McpServerEntry } from "./sources.js";

export interface SkillGap {
  name: string;
  source: string;
  description: string;
  url: string;
  relevanceScore: number;
  reason: string;
}

export interface UpdateReport {
  checkedAt: string;
  openclawTotal: number;
  mcpTotal: number;
  gaps: SkillGap[];
  alreadyCovered: string[];
}

export interface SkillUpdaterConfig {
  /** Names of already-installed @lns-skills packages (without the @lns-skills/ prefix) */
  installedPackages: string[];
  /** Path to .learnings directory (optional — for auto-logging gaps) */
  learningsDir?: string;
  /** Keywords that describe your use case — used for relevance scoring */
  domainKeywords?: string[];
}

// Keywords that indicate relevance to knowledge management / productivity / finance
const DEFAULT_KEYWORDS = [
  "knowledge", "memory", "search", "email", "calendar", "notes", "slack",
  "github", "browser", "finance", "stock", "crypto", "analytics", "summarize",
  "digest", "todo", "task", "reminder", "document", "pdf", "research",
];

// Concepts already well-covered by @lns-skills packages — skip these
const COVERED_CONCEPTS = [
  "hybrid-search", "search", "vector", "semantic",
  "triage", "email-triage", "email classify",
  "capture", "capture-thought", "knowledge capture",
  "ai-router", "model routing", "model selection",
  "email-draft", "draft", "email compose",
  "action-items", "action item", "task extract",
  "conversation-memory", "conversation", "memory store",
  "channel-formatter", "format", "sms format", "telegram",
  "stock-analysis", "stock", "crypto", "finance analysis",
  "skill-updater", "skill discovery", "mcp registry",
  // MCP tools already implemented in personal infrastructure
  "youtube transcript", "youtube", "reminders", "imessage",
  "brave search", "web search", "read url", "jina",
  "apple notes", "apple reminders",
];

function scoreRelevance(entry: { name: string; description: string; tags?: string[] }, keywords: string[]): number {
  const text = `${entry.name} ${entry.description} ${(entry.tags ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) score += 1;
  }
  // Bonus for high-value patterns
  if (text.includes("financial") || text.includes("market") || text.includes("trading")) score += 2;
  if (text.includes("autonomous") || text.includes("agent") || text.includes("workflow")) score += 1;
  if (text.includes("notification") || text.includes("alert") || text.includes("monitor")) score += 1;
  return score;
}

function isAlreadyCovered(name: string, description: string): boolean {
  const text = `${name} ${description}`.toLowerCase();
  return COVERED_CONCEPTS.some(concept => text.includes(concept.toLowerCase()));
}

export function createSkillUpdater(config: SkillUpdaterConfig) {
  const keywords = [...DEFAULT_KEYWORDS, ...(config.domainKeywords ?? [])];

  return {
    /** Fetch all sources and compute gaps against installed packages */
    async check(): Promise<UpdateReport> {
      const checkedAt = new Date().toISOString();

      const [openclawSkills, smitheryServers, githubServers] = await Promise.all([
        listOpenClawSkillNames(),
        fetchSmitheryServers(100),
        fetchGithubMcpServers(),
      ]);

      const allMcp: McpServerEntry[] = [...smitheryServers, ...githubServers];
      const gaps: SkillGap[] = [];
      const alreadyCovered: string[] = [];

      // Check OpenClaw skills
      for (const skill of openclawSkills) {
        const displayName = `${skill.author}/${skill.name}`;
        // Skip if concept already covered
        if (isAlreadyCovered(skill.name, "")) {
          alreadyCovered.push(displayName);
          continue;
        }
        // Skip if name matches an installed package
        if (config.installedPackages.some(p => skill.name.includes(p) || p.includes(skill.name))) {
          alreadyCovered.push(displayName);
          continue;
        }
        const score = scoreRelevance({ name: skill.name, description: skill.name }, keywords);
        if (score > 0) {
          gaps.push({
            name: displayName,
            source: "openclaw",
            description: `OpenClaw skill: ${skill.name}`,
            url: `https://clawhub.ai/${skill.author}/${skill.name}`,
            relevanceScore: score,
            reason: `Relevant OpenClaw skill not yet implemented as @lns-skills/ package`,
          });
        }
      }

      // Check MCP servers
      for (const server of allMcp) {
        if (isAlreadyCovered(server.name, server.description)) {
          alreadyCovered.push(server.name);
          continue;
        }
        const score = scoreRelevance(server, keywords);
        if (score >= 2) { // Higher threshold for MCP servers (more noise)
          gaps.push({
            name: server.name,
            source: server.source,
            description: server.description,
            url: server.url,
            relevanceScore: score,
            reason: `MCP server not yet integrated as an lns-skills tool`,
          });
        }
      }

      // Sort by relevance descending
      gaps.sort((a, b) => b.relevanceScore - a.relevanceScore);

      return {
        checkedAt,
        openclawTotal: openclawSkills.length,
        mcpTotal: allMcp.length,
        gaps: gaps.slice(0, 50), // Top 50
        alreadyCovered: alreadyCovered.slice(0, 20),
      };
    },

    /** Search for specific capabilities across all sources */
    async search(query: string): Promise<Array<{ name: string; source: string; description: string; url: string }>> {
      const [openclawSkills, smitheryResults] = await Promise.all([
        listOpenClawSkillNames(),
        searchSmithery(query, 10),
      ]);

      const queryLower = query.toLowerCase();
      const results: Array<{ name: string; source: string; description: string; url: string }> = [];

      // OpenClaw skills matching query
      for (const skill of openclawSkills) {
        if (skill.name.toLowerCase().includes(queryLower)) {
          results.push({
            name: `${skill.author}/${skill.name}`,
            source: "openclaw",
            description: `OpenClaw skill: ${skill.name}`,
            url: `https://clawhub.ai/${skill.author}/${skill.name}`,
          });
        }
      }

      // Smithery MCP servers
      for (const server of smitheryResults) {
        results.push({
          name: server.name,
          source: "smithery",
          description: server.description,
          url: server.url,
        });
      }

      return results;
    },

    /** Write gaps to .learnings/FEATURE_REQUESTS.md */
    async logGaps(report: UpdateReport, topN = 10): Promise<number> {
      if (!config.learningsDir) return 0;

      const dir = config.learningsDir;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const frPath = join(dir, "FEATURE_REQUESTS.md");
      let existing = existsSync(frPath) ? readFileSync(frPath, "utf8") : "# Feature Requests\n\n---\n\n";

      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      let logged = 0;

      for (const gap of report.gaps.slice(0, topN)) {
        // Skip if already logged (check by name)
        if (existing.includes(gap.name)) continue;

        const id = `FEAT-${date}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        const entry = `
## [${id}] ${gap.name}

**Logged**: ${report.checkedAt}
**Priority**: ${gap.relevanceScore >= 3 ? "high" : "medium"}
**Status**: pending

### Requested Capability
${gap.description}

### Source
- From: ${gap.source}
- URL: ${gap.url}
- Relevance Score: ${gap.relevanceScore}

### Suggested Implementation
Build as \`@lns-skills/${gap.name.split("/").pop()}\` package or MCP tool.

### Metadata
- Frequency: first_time
- Discovery: skill-updater auto-scan (${report.checkedAt.slice(0, 10)})

---
`;
        existing += entry;
        logged++;
      }

      writeFileSync(frPath, existing);
      return logged;
    },

    /** Print a human-readable report */
    formatReport(report: UpdateReport): string {
      const lines = [
        `Skill Update Report — ${new Date(report.checkedAt).toLocaleString()}`,
        `Checked: ${report.openclawTotal} OpenClaw skills, ${report.mcpTotal} MCP servers`,
        `Already covered: ${report.alreadyCovered.length} items`,
        `\nTop gaps (by relevance):`,
      ];

      for (const gap of report.gaps.slice(0, 15)) {
        lines.push(`  [${gap.relevanceScore}] ${gap.name} (${gap.source})`);
        if (gap.description) lines.push(`       ${gap.description.slice(0, 80)}`);
      }

      return lines.join("\n");
    },
  };
}
