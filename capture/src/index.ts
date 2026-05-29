// UNUSED — extracted for future reuse
/**
 * @lns-skills/capture
 *
 * Universal knowledge capture with embedding + metadata extraction + deduplication.
 * Stores content into a Postgres + pgvector "thoughts" table.
 *
 * Usage:
 *   import { createCapture } from "@lns-skills/capture";
 *
 *   const capture = createCapture({
 *     pool,
 *     embedFn: text => myEmbed(text),
 *     extractMetadataFn: text => myExtract(text),  // optional
 *   });
 *
 *   // New item — embeds + inserts, returns id
 *   const { id } = await capture.add({ content: "Remember to...", tags: ["todo"], source: "manual" });
 *
 *   // Idempotent upsert — skips if externalId already exists
 *   const added = await capture.upsert({ externalId: "gmail:abc123", content, source: "gmail" });
 */

import type { Pool } from "pg";
import { createHash } from "crypto";

export interface CaptureConfig {
  pool: Pool;
  embedFn: (text: string) => Promise<number[]>;
  /** Optional — extracts structured metadata from content (people, topics, type, etc.) */
  extractMetadataFn?: (text: string) => Promise<Record<string, unknown>>;
  /** Table name — default "thoughts" */
  table?: string;
}

export interface CaptureInput {
  content: string;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpsertInput extends CaptureInput {
  /** Stable external ID for deduplication */
  externalId: string;
}

export interface CaptureResult {
  id: string;
  created_at: Date;
  metadata: Record<string, unknown>;
}

/** Hashes long keys to prevent exceeding column limits */
export function makeExternalId(key: string): string {
  if (key.length <= 200) return key;
  return createHash("sha256").update(key).digest("hex");
}

export function createCapture(config: CaptureConfig) {
  const table = config.table ?? "thoughts";

  return {
    /** Always inserts (no dedup check). Returns new row id + metadata. */
    async add(input: CaptureInput): Promise<CaptureResult> {
      const { content, tags = [], source = "manual", metadata: extraMeta = {} } = input;

      const [embedding, extractedMeta] = await Promise.all([
        config.embedFn(content),
        config.extractMetadataFn ? config.extractMetadataFn(content).catch(() => ({})) : Promise.resolve({}),
      ]);
      if (!embedding?.length) throw new Error("embedFn returned empty embedding");

      const metadata = { ...extractedMeta, ...extraMeta };

      const result = await config.pool.query(
        `INSERT INTO ${table} (content, embedding, metadata, tags, source)
         VALUES ($1, $2::vector, $3, $4, $5)
         RETURNING id, created_at`,
        [content, `[${embedding.join(",")}]`, JSON.stringify(metadata), tags, source],
      );

      return { id: result.rows[0].id, created_at: result.rows[0].created_at, metadata };
    },

    /**
     * Dedup-upsert: skips if externalId already exists.
     * Returns true if inserted, false if already existed.
     */
    async upsert(input: UpsertInput): Promise<boolean> {
      const exists = await config.pool.query(
        `SELECT 1 FROM ${table} WHERE external_id = $1`,
        [input.externalId],
      );
      if (exists.rows.length > 0) return false;

      const [embedding, extractedMeta] = await Promise.all([
        config.embedFn(input.content),
        config.extractMetadataFn ? config.extractMetadataFn(input.content).catch(() => ({})) : Promise.resolve({}),
      ]);
      if (!embedding?.length) throw new Error("embedFn returned empty embedding");

      const metadata = { ...extractedMeta, ...(input.metadata ?? {}) };

      await config.pool.query(
        `INSERT INTO ${table} (content, embedding, metadata, tags, source, external_id)
         VALUES ($1, $2::vector, $3, $4, $5, $6)`,
        [
          input.content,
          `[${embedding.join(",")}]`,
          JSON.stringify(metadata),
          input.tags ?? [],
          input.source ?? "sync",
          input.externalId,
        ],
      );
      return true;
    },
  };
}
