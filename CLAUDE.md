# ai-skills (@lns/ai-skills)

**Shared AI infrastructure monorepo.** 13 config-driven, zero-hardcoded-credential packages used by CDI, analyst-ai, OpenBrain, and other LNS/Axiom projects.

---

## Who Uses This

| Consumer | Packages used |
|---|---|
| CDI | output-quality, hybrid-search, pptx-extractor, sharepoint-files, channel-formatter |
| analyst-ai | hybrid-search, capture, conversation-memory |
| OpenBrain | hybrid-search, capture, triage, email-draft, action-items, ai-router |
| Market Intelligence | stock-analysis |

**Owner:** Ryan Cahalane

---

## Stack

- Node.js + TypeScript (ESM, npm workspaces)
- Packages publish to GitHub Packages (`@lns-skills/` scope)
- During dev: referenced via `file:../ai-skills/[package]` in consuming project's package.json

---

## Packages

| Package | What it does |
|---|---|
| `ai-router` | Model routing with auto-fallback: Sonnet→GPT-4o→Gemini Flash, Haiku→GPT-4o-mini→Gemini Flash |
| `hybrid-search` | Semantic + keyword search over Postgres/pgvector using Reciprocal Rank Fusion |
| `capture` | Universal knowledge capture: embed, extract metadata, dedup-upsert |
| `triage` | Email AI triage: classify (dispatch/prep/yours/skip), draft responses, learn from feedback |
| `email-draft` | Push email drafts to Gmail API or Apple Mail via JXA (macOS) |
| `action-items` | Extract structured action items from transcripts, documents, messages |
| `conversation-memory` | Cross-session AI memory: extract durable facts, inject into future prompts |
| `channel-formatter` | Format AI Markdown for Telegram, Slack, Teams, SMS (zero dependencies) |
| `output-quality` | Consultant document pipeline: review (Haiku), revise (Sonnet), compress for PPTX |
| `pptx-extractor` | Extract per-slide text + structured fields from PPTX (Workers-compatible) |
| `sharepoint-files` | M365 SharePoint file access via Microsoft Graph API |
| `stock-analysis` | Multi-dimensional stock/crypto analysis (Yahoo Finance, SEC EDGAR, CoinGecko) |
| `skill-updater` | Monitor OpenClaw, Smithery, GitHub MCP registry for capability gaps |

---

## Core Design Patterns

**Factory pattern — all packages:**
```typescript
// Config passed at construction, never hardcoded
const search = createHybridSearch({ pool, embedFn, table: "thoughts" });
const ai = createAIRouter({ anthropicKey, openaiKey, geminiKey });
const q = createOutputQuality({ apiKey: process.env.ANTHROPIC_API_KEY });
```

**AI Router:**
```typescript
await ai.fast({ user: "classify this" });          // Haiku → GPT-4o-mini → Gemini Flash
await ai.best({ system: "...", user: "..." });     // Sonnet → GPT-4o → Gemini Flash
await ai.vision({ user: "describe", imageUrl }); // Vision-capable model
await ai.ollama({ user: "local only" });           // Local fallback
```

**Hybrid search:**
```typescript
const results = await search({ query: "project roadmap", limit: 10 });
await search.upsert({ externalId: "id", content: "...", source: "email", tags: ["Q3"] });
```

**Output quality pipeline:**
```typescript
const review = await q.reviewContent(markdown);        // scores 1-10, approve ≥7
if (!review.approved) {
  markdown = await q.reviseContent(markdown, review.revision_instructions);
}
markdown = await q.compressForPptx(markdown, goldExamples); // ≤700 chars/section
```

---

## Development

```bash
npm install       # installs all workspaces
npm run build     # builds all packages to dist/
```

**Using a package locally (consuming project):**
```json
"@lns-skills/hybrid-search": "file:../ai-skills/hybrid-search"
```

**Publishing to GitHub Packages:**
```bash
# Requires GitHub PAT with packages:write in ~/.npmrc
npm publish --workspace=hybrid-search
```

---

## Security Rules (Non-Negotiable)

1. **Never commit API keys, tokens, email addresses, OAuth credentials**
2. **All config passed as constructor/factory parameters** — callers supply from their `.env`
3. **Run `npx secretlint "**/*"` before committing** — will catch accidental credential leaks
4. Zero hardcoded credentials anywhere in any package

---

## Adding a New Package

1. Create `[package-name]/` directory with `package.json`, `tsconfig.json`, `src/index.ts`
2. Use factory pattern — export `create[PackageName](config)` function
3. Define TypeScript interfaces for config and return types
4. Add `"@lns-skills/[package-name]": "*"` to consuming projects
5. Add to this CLAUDE.md's package table
6. Run `npx secretlint` before first commit

---

## Non-Obvious Gotchas

1. **`channel-formatter` has zero dependencies** — intentional; keeps it deployable everywhere including CF Workers
2. **`pptx-extractor` is Workers-compatible** — no Node.js-only APIs; test in a Worker context before using Node APIs
3. **`sharepoint-files` requires M365 app registration** — needs `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
4. **Peer dependencies** — most packages declare Anthropic SDK, pg, etc. as peer deps, not direct deps — the consumer must install them
5. **`ai-router` fallback order matters** — Anthropic is primary; OpenAI and Gemini are fallbacks only. Don't add Gemini as primary without discussion.

---

## Contributing

- Run `/plan-eng-review` before adding or changing any package's public API (breaking changes affect multiple consumers)
- Run `/review` before committing
- Run `npx secretlint` — mandatory before every commit
- Run `/compound` after sessions to capture patterns

---

## docs/ Structure

```
docs/
  decisions/    # Why key patterns were chosen (factory pattern, peer deps, etc.)
  solutions/    # /compound output
  plans/        # /ce-plan output
```
