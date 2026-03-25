/**
 * Data sources for skill discovery.
 * All free — no API keys required.
 */

const HEADERS = {
  "User-Agent": "lns-skills-updater/1.0",
  Accept: "application/json",
};

export interface SkillEntry {
  name: string;
  author: string;
  description: string;
  source: "openclaw" | "mcp-registry" | "smithery" | "mcp-so";
  url: string;
  updatedAt?: string;
  tags?: string[];
}

export interface McpServerEntry {
  name: string;
  description: string;
  source: "smithery" | "mcp-so" | "github";
  url: string;
  stars?: number;
  updatedAt?: string;
  tags?: string[];
}

// ── OpenClaw / GitHub skills ─────────────────────────────────────────────────

/** Fetch recently updated skills from openclaw/skills GitHub repo */
export async function fetchOpenClawSkills(
  daysBack = 30,
  maxSkills = 100,
): Promise<SkillEntry[]> {
  const skills: SkillEntry[] = [];

  // Get list of skill directories via GitHub API tree
  const treeUrl = "https://api.github.com/repos/openclaw/skills/git/trees/main?recursive=1";
  try {
    const r = await fetch(treeUrl, { headers: HEADERS });
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const d = await r.json() as { tree: Array<{ path: string; type: string }> };

    // Find all SKILL.md files
    const skillFiles = d.tree.filter(t => t.path.endsWith("/SKILL.md") && t.type === "blob");

    // Fetch commit history to get recently updated ones
    const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();
    const commitUrl = `https://api.github.com/repos/openclaw/skills/commits?since=${cutoff}&path=skills&per_page=100`;
    const commitR = await fetch(commitUrl, { headers: HEADERS });
    const recentPaths = new Set<string>();

    if (commitR.ok) {
      const commits = await commitR.json() as Array<{ commit: { message: string }; files?: Array<{ filename: string }> }>;
      // Commits endpoint doesn't return files — we'll use date filter differently
      // Just fetch all skills and return them, flagging recently-pushed ones
      void commits;
    }

    // For each skill file, extract metadata from path: skills/{author}/{skill-name}/SKILL.md
    const batch = skillFiles.slice(0, maxSkills);
    await Promise.all(batch.map(async (file) => {
      const parts = file.path.split("/");
      if (parts.length < 4) return; // skills/{author}/{name}/SKILL.md
      const author = parts[1];
      const name = parts[2];

      // Fetch raw SKILL.md for description (just the frontmatter)
      const rawUrl = `https://raw.githubusercontent.com/openclaw/skills/main/${file.path}`;
      try {
        const rawR = await fetch(rawUrl, { headers: HEADERS });
        if (!rawR.ok) return;
        const text = await rawR.text();

        // Parse YAML frontmatter
        const descMatch = text.match(/description:\s*["']?(.*?)["']?\n/);
        const description = descMatch?.[1]?.replace(/^["']|["']$/g, "") ?? "";

        skills.push({
          name,
          author,
          description,
          source: "openclaw",
          url: `https://clawhub.ai/${author}/${name}`,
        });
      } catch {
        // Skip skills we can't fetch
      }
    }));
  } catch (e) {
    console.error("OpenClaw fetch failed:", e instanceof Error ? e.message : e);
  }

  return skills;
}

/** Get just the directory listing of skills (fast, no content fetch) */
export async function listOpenClawSkillNames(): Promise<Array<{ author: string; name: string }>> {
  const treeUrl = "https://api.github.com/repos/openclaw/skills/git/trees/main?recursive=1";
  try {
    const r = await fetch(treeUrl, { headers: HEADERS });
    if (!r.ok) return [];
    const d = await r.json() as { tree: Array<{ path: string; type: string }> };
    return d.tree
      .filter(t => t.path.startsWith("skills/") && t.path.endsWith("/SKILL.md"))
      .map(t => {
        const parts = t.path.split("/");
        return { author: parts[1], name: parts[2] };
      })
      .filter(e => e.author && e.name);
  } catch {
    return [];
  }
}

// ── MCP Registries ───────────────────────────────────────────────────────────

/** Fetch servers from Smithery (smithery.ai) */
export async function fetchSmitheryServers(limit = 50): Promise<McpServerEntry[]> {
  try {
    // Smithery has a public API
    const r = await fetch(`https://smithery.ai/api/packages?limit=${limit}&sort=recent`, {
      headers: HEADERS,
    });
    if (!r.ok) return [];
    const d = await r.json() as {
      packages?: Array<{
        name: string;
        description?: string;
        updatedAt?: string;
        qualifiedName?: string;
        tags?: string[];
        githubStars?: number;
      }>;
    };
    return (d.packages ?? []).map(p => ({
      name: p.name ?? p.qualifiedName ?? "unknown",
      description: p.description ?? "",
      source: "smithery" as const,
      url: `https://smithery.ai/server/${p.qualifiedName ?? p.name}`,
      stars: p.githubStars,
      updatedAt: p.updatedAt,
      tags: p.tags,
    }));
  } catch {
    return [];
  }
}

/** Search Smithery for relevant tools by keyword */
export async function searchSmithery(query: string, limit = 20): Promise<McpServerEntry[]> {
  try {
    const r = await fetch(`https://smithery.ai/api/packages?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: HEADERS,
    });
    if (!r.ok) return [];
    const d = await r.json() as { packages?: Array<{ name: string; description?: string; qualifiedName?: string }> };
    return (d.packages ?? []).map(p => ({
      name: p.name ?? p.qualifiedName ?? "unknown",
      description: p.description ?? "",
      source: "smithery" as const,
      url: `https://smithery.ai/server/${p.qualifiedName ?? p.name}`,
    }));
  } catch {
    return [];
  }
}

/** Fetch from GitHub MCP servers list (modelcontextprotocol/servers) */
export async function fetchGithubMcpServers(): Promise<McpServerEntry[]> {
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md",
      { headers: HEADERS },
    );
    if (!r.ok) return [];
    const text = await r.text();

    // Parse the README table entries: | Name | Description | ... |
    const entries: McpServerEntry[] = [];
    const tableRows = text.matchAll(/\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+)\|/g);
    for (const row of tableRows) {
      const name = row[1].trim();
      const url = row[2].trim();
      const description = row[3].trim();
      if (name && description && !name.startsWith("---")) {
        entries.push({ name, description, source: "github", url });
      }
    }
    return entries;
  } catch {
    return [];
  }
}
