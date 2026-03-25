/**
 * @lns-skills/ai-router
 *
 * Unified model routing layer:
 *   - Haiku  → fast classification, extraction, summarization
 *   - Sonnet → complex reasoning, drafting, analysis
 *   - Local  → Ollama (falls back to Haiku if unavailable)
 *
 * Unifies the embedding provider pattern from personal tooling and
 * lnsr-tool-v2's localOrHaiku into one consistent interface.
 *
 * Usage:
 *   import { createAIRouter } from "@lns-skills/ai-router";
 *
 *   const ai = createAIRouter({ anthropicApiKey: process.env.ANTHROPIC_API_KEY });
 *
 *   const summary = await ai.haiku({ system: "Summarize.", user: longText });
 *   const analysis = await ai.sonnet({ user: "What should I do about..." });
 *   const local = await ai.local({ user: "Quick extraction task" }); // Ollama → Haiku fallback
 */

export interface AIRouterConfig {
  anthropicApiKey: string;
  /** Ollama base URL — default http://localhost:11434 */
  ollamaUrl?: string;
  /** Ollama model name — default llama3.2 */
  ollamaModel?: string;
}

export interface CallOptions {
  system?: string;
  user: string;
  maxTokens?: number;
}

export interface AIRouter {
  /** Claude Haiku — fast, cheap. Use for: classify, extract, summarize, batch tasks */
  haiku(opts: CallOptions): Promise<string>;
  /** Claude Sonnet — best reasoning. Use for: draft, analyze, plan, judge */
  sonnet(opts: CallOptions): Promise<string>;
  /**
   * Local Ollama first, falls back to Haiku if Ollama is unavailable.
   * Use for: dev/offline tasks, privacy-sensitive extraction.
   */
  local(opts: CallOptions): Promise<string>;
  /** Embed text to a float vector (via Ollama nomic-embed-text or OpenAI) */
  embed(text: string): Promise<number[]>;
}

const MODELS = {
  HAIKU: "claude-haiku-4-5-20251001",
  SONNET: "claude-sonnet-4-6",
};

export function createAIRouter(config: AIRouterConfig): AIRouter {
  const ollamaUrl = config.ollamaUrl ?? "http://localhost:11434";
  const ollamaModel = config.ollamaModel ?? "llama3.2";

  async function callAnthropic(model: string, opts: CallOptions): Promise<string> {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.user }],
      }),
    });
    const d = await r.json() as { content?: { text?: string }[] };
    return d.content?.[0]?.text?.trim() ?? "";
  }

  async function callOllama(opts: CallOptions): Promise<string | null> {
    try {
      const r = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          messages: [
            ...(opts.system ? [{ role: "system", content: opts.system }] : []),
            { role: "user", content: opts.user },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return null;
      const d = await r.json() as { message?: { content?: string } };
      return d.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  return {
    haiku: (opts) => callAnthropic(MODELS.HAIKU, opts),
    sonnet: (opts) => callAnthropic(MODELS.SONNET, opts),
    async local(opts) {
      const result = await callOllama(opts);
      if (result !== null) return result;
      return callAnthropic(MODELS.HAIKU, opts); // fallback
    },
    async embed(text) {
      try {
        const r = await fetch(`${ollamaUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          const d = await r.json() as { embedding?: number[] };
          if (d.embedding) return d.embedding;
        }
      } catch { /* fall through */ }
      // OpenAI fallback
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const r = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
        });
        const d = await r.json() as { data?: { embedding: number[] }[] };
        if (d.data?.[0]) return d.data[0].embedding;
      }
      throw new Error("No embedding provider available (Ollama or OPENAI_API_KEY)");
    },
  };
}
