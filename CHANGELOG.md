# AI Skills Changelog

All notable changes to the `ai-skills` package collection are documented here.
Format: newest first.

---

## [2026-03-27] — New Package

### New Packages
- **`@lns-skills/output-quality`** — AI quality pipeline for consultant documents before export. Three-stage pipeline: `reviewContent` (Sonnet quality gating, score 1–10, approve ≥ 7), `reviseContent` (Sonnet rewrite using reviewer instructions), `compressForPptx` (Sonnet slide-fit compression with gold standard injection, ≤ 700 body chars per `##` section, prose-to-bullets conversion). All methods fail open. Works in Node.js and Cloudflare Workers. Extracted from CDI `generate.js`.

---

## [2026-03-12] — Two New Packages

### New Packages
- **`@lns-skills/pptx-extractor`** — Generic PPTX slide extractor. Unzips PPTX as a ZIP (via fflate), parses per-slide `<a:t>` text runs, and applies configurable regex/strategy extractors to pull structured fields (IDs, percentages, headlines, section headers) from slide text. Works in Node.js and Cloudflare Workers. Ships with a pre-built `LNS_RESEARCH_EXTRACTORS` config for LNS master data decks (L/F benchmark stats). Extracted from CDI `sync-visual-catalog` cron.
- **`@lns-skills/sharepoint-files`** — M365 SharePoint file access via Graph API. Config-driven client factory: client-credentials auth with token caching, site lookup by host:path (no Sites.Read.All required), drive listing, BFS file traversal with filter options, file download, and plain-text extraction for PPTX/DOCX/PDF/XLSX/text formats (heavy extractors are dynamic imports — install only what you need). Works in Node.js and Cloudflare Workers. Extracted from CDI `ms365.js`.

---

## [2026-03-07] — Three New Packages

### New Packages
- **`@lns-skills/action-items`** — Claude-powered structured action item extraction from meeting transcripts and documents. Config-driven: model, confidence threshold, output schema all injectable. Extracted from CDI codebase.
- **`@lns-skills/conversation-memory`** — Cross-session memory via Supabase. Extracts 0–4 durable facts per AI turn via Haiku, stores them, and injects them into future system prompts as context. Extracted from CDI codebase.
- **`@lns-skills/channel-formatter`** — Zero-dependency Markdown formatter for Telegram / Slack / Teams / SMS. Handles platform-specific syntax differences and message chunking for length limits. Extracted from CDI channel infrastructure.

---

## [2026-03-07] — Initial Release

### Packages
- **`@lns-skills/hybrid-search`** — pgvector cosine similarity + tsvector GIN keyword search via Reciprocal Rank Fusion. Configurable weights, fallback to keyword-only when no embedding model available.
- **`@lns-skills/triage`** — Claude Haiku email classifier and draft generator. Sweep classes: `dispatch`, `prep`, `yours`, `skip`. Batches emails (configurable batch size), drafts responses in parallel. Dedup by `externalId`.
- **`@lns-skills/capture`** — Embed + dedup-upsert into pgvector store. Handles chunking, embedding generation, and content-hash dedup so re-syncing the same document is safe.
- **`@lns-skills/ai-router`** — Model routing: Haiku → Sonnet → Ollama with configurable `requireQuality` flag. Shared across personal and CDI tooling. OpenRouter free tier as final fallback.
- **`@lns-skills/email-draft`** — Email draft push via Gmail API (insert to Drafts folder) or Apple Mail JXA script. Tone and recipient context aware.

All packages are config-driven with no hardcoded credentials or personal data. Designed to be consumed by personal automation tooling and CDI (SaaS product) without modification.
