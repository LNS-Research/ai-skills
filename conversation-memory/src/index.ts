/**
 * @lns-skills/conversation-memory
 *
 * Cross-session AI conversation memory.
 * Extracts durable facts from AI exchanges using Claude Haiku and
 * stores them in a Supabase (or compatible Postgres REST) table.
 * Inject loaded memories into future system prompts for continuity.
 *
 * Usage:
 *   import { createMemoryStore } from "@lns-skills/conversation-memory";
 *
 *   const memory = createMemoryStore({
 *     anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
 *     supabaseUrl: process.env.SUPABASE_URL!,
 *     supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *   });
 *
 *   // After each AI turn (fire-and-forget):
 *   memory.save({ userId, userMessage, aiResponse });
 *
 *   // Before building system prompt:
 *   const facts = await memory.load({ userId });
 *   const systemPrompt = facts.length
 *     ? `What you know about this user:\n${facts.map(f => `- ${f}`).join("\n")}\n\n`
 *     : "";
 *
 * Required Supabase table:
 *   CREATE TABLE conversation_memories (
 *     id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id    TEXT,
 *     entity_id  TEXT,
 *     fact       TEXT NOT NULL,
 *     source_conversation_id TEXT,
 *     created_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   CREATE INDEX ON conversation_memories (user_id);
 *   CREATE INDEX ON conversation_memories (entity_id);
 */

export interface MemoryStoreConfig {
  anthropicApiKey: string;
  supabaseUrl: string;
  /** Service role key (never expose to browser) */
  supabaseKey: string;
  /** Claude model for extraction — default claude-haiku-4-5-20251001 */
  model?: string;
  /** Table name — default "conversation_memories" */
  table?: string;
  /** Max memories per scope before oldest are pruned — default 60 */
  cap?: number;
}

export interface SaveMemoryParams {
  /** User identifier (e.g. user UUID or email) */
  userId?: string;
  /** Optional secondary scope: company ID, org ID, project ID, etc. */
  entityId?: string;
  conversationId?: string;
  userMessage?: string;
  aiResponse?: string;
}

export interface LoadMemoryParams {
  userId?: string;
  entityId?: string;
  /** Max facts to return — default 30 */
  limit?: number;
}

export interface MemoryStore {
  /**
   * Extract facts from an exchange and persist them.
   * Fire-and-forget safe — never throws.
   */
  save(params: SaveMemoryParams): Promise<void>;

  /**
   * Load facts relevant to this user and/or entity.
   * Returns most-recent-first strings, ready to inject into a system prompt.
   */
  load(params: LoadMemoryParams): Promise<string[]>;
}

const EXTRACTION_SYSTEM = `You extract durable facts worth remembering across future conversations.

Review the exchange and extract 0-4 facts. Only extract:
- User communication preferences confirmed in this exchange ("prefers bullet points", "wants concise answers")
- Confirmed facts about the entity not easily looked up (leadership changes, strategic pivots, key personnel)
- Corrections to AI assumptions ("our CFO is actually Jane, not John")
- Agreed follow-ups or commitments ("will review proposal in March")

DO NOT extract:
- General knowledge already in training data
- Things that quickly go stale (prices, news)
- Questions, uncertainties, or tentative statements
- Routine conversational filler

Classify each fact as "user" (preference/style about this person) or "entity" (fact about the company/project/org).

Respond ONLY with valid JSON:
[{"fact": "...", "scope": "user"}, {"fact": "...", "scope": "entity"}]

If nothing is worth saving, respond with: []`;

interface DbRow {
  id: string;
}

export function createMemoryStore(config: MemoryStoreConfig): MemoryStore {
  const {
    anthropicApiKey,
    supabaseUrl,
    supabaseKey,
    model = "claude-haiku-4-5-20251001",
    table = "conversation_memories",
    cap = 60,
  } = config;

  async function dbFetch(path: string, opts: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=representation",
        ...(opts.headers as Record<string, string> ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${path}: ${res.status} ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function save(params: SaveMemoryParams): Promise<void> {
    const { userId, entityId, conversationId, userMessage, aiResponse } = params;
    if (!userMessage && !aiResponse) return;
    if (!userId && !entityId) return;

    try {
      const exchange = [
        userMessage ? `User: ${userMessage.slice(0, 1500)}` : "",
        aiResponse  ? `AI: ${aiResponse.slice(0, 2500)}`    : "",
      ].filter(Boolean).join("\n\n");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          system: EXTRACTION_SYSTEM,
          messages: [{ role: "user", content: exchange }],
        }),
      });

      const data = await response.json() as { content?: { type: string; text?: string }[] };
      const raw = data.content?.find(b => b.type === "text")?.text ?? "[]";

      let extracted: { fact: string; scope: string }[] = [];
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        extracted = match ? JSON.parse(match[0]) : [];
      } catch {
        extracted = [];
      }

      if (!Array.isArray(extracted) || extracted.length === 0) return;

      const rows = extracted
        .filter(e => typeof e?.fact === "string" && e.fact.trim().length > 5)
        .map(e => ({
          user_id:   e.scope === "user"   ? (userId   ?? null) : null,
          entity_id: e.scope === "entity" ? (entityId ?? null) : null,
          fact: e.fact.trim().slice(0, 500),
          source_conversation_id: conversationId ?? null,
        }))
        .filter(r => r.user_id || r.entity_id);

      if (rows.length === 0) return;

      // Enforce cap per scope — prune oldest if needed
      for (const [col, scopeId] of [["user_id", userId], ["entity_id", entityId]] as [string, string | undefined][]) {
        if (!scopeId) continue;
        const countData = await dbFetch(
          `/${table}?${col}=eq.${encodeURIComponent(scopeId)}&select=id`,
          { headers: { "Prefer": "count=exact" } },
        ) as DbRow[];
        const count = Array.isArray(countData) ? countData.length : 0;
        const incoming = rows.filter(r => (r as Record<string, unknown>)[col] === scopeId).length;
        const overflow = count + incoming - cap;

        if (overflow > 0) {
          const oldest = await dbFetch(
            `/${table}?${col}=eq.${encodeURIComponent(scopeId)}&select=id&order=created_at.asc&limit=${overflow}`,
          ) as DbRow[];
          if (Array.isArray(oldest) && oldest.length > 0) {
            const ids = oldest.map(r => r.id).join(",");
            await dbFetch(`/${table}?id=in.(${ids})`, { method: "DELETE" });
          }
        }
      }

      await dbFetch(`/${table}`, {
        method: "POST",
        body: JSON.stringify(rows),
      });
    } catch (err) {
      // Best-effort — never propagate
      console.error("[conversation-memory] save failed:", (err as Error).message);
    }
  }

  async function load(params: LoadMemoryParams): Promise<string[]> {
    const { userId, entityId, limit = 30 } = params;
    if (!userId && !entityId) return [];
    try {
      const orParts = [];
      if (userId)   orParts.push(`user_id.eq.${userId}`);
      if (entityId) orParts.push(`entity_id.eq.${entityId}`);

      const data = await dbFetch(
        `/${table}?or=(${orParts.join(",")})&select=fact&order=created_at.desc&limit=${limit}`,
      ) as { fact: string }[];

      return Array.isArray(data) ? data.map(r => r.fact) : [];
    } catch {
      return [];
    }
  }

  return { save, load };
}
