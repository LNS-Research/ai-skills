# @lns-skills/output-quality

AI quality pipeline for consultant documents before export (PPTX, PDF, DOCX). Extracted from CDI's export pipeline — same prompts, same models, same fail-open behaviour.

Three operations, used in sequence:

1. **`reviewContent`** — Sonnet checks if content is a real analyst deliverable (score 1–10, approve ≥ 7)
2. **`reviseContent`** — Sonnet rewrites content using the reviewer's specific instructions
3. **`compressForPptx`** — Sonnet condenses each `##` section to ≤ 700 body characters for slide fit, applying gold standard style and prose-to-bullets conversion

All three methods **fail open** — they return the original content unchanged on error. The caller is responsible for fetching gold standard examples from their own DB.

Works in **Node.js and Cloudflare Workers** (no Node-specific APIs used).

---

## Install

```bash
# During development (file path reference)
npm install file:../ai-skills/output-quality

# Once published to GitHub Packages
npm install @lns-skills/output-quality
```

Peer dependency: `@anthropic-ai/sdk >= 0.20`

---

## Quick Start

```typescript
import { createOutputQuality } from "@lns-skills/output-quality";

const q = createOutputQuality({ apiKey: process.env.ANTHROPIC_API_KEY });

// Step 1: Review
const review = await q.reviewContent(markdown);

// Step 2: Revise if quality is insufficient
if (!review.approved) {
  markdown = await q.reviseContent(markdown, review.revision_instructions);
}

// Step 3: Compress for PPTX slide fit
// goldExamples: pre-formatted string from your DB, or null
markdown = await q.compressForPptx(markdown, goldExamples);
```

---

## API Reference

### `createOutputQuality(options?)`

Factory function. Returns an `OutputQuality` instance.

```typescript
function createOutputQuality(opts?: OutputQualityOptions): OutputQuality
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `process.env.ANTHROPIC_API_KEY` | Anthropic API key |
| `reviewModel` | `string` | `'claude-sonnet-4-6'` | Model for review + compress passes |
| `reviseModel` | `string` | `'claude-sonnet-4-6'` | Model for revision pass |

---

### `reviewContent(content)`

Checks whether `content` is a genuine analyst deliverable. Rejects conversational AI responses, outlines with no body, and AI preamble artifacts.

```typescript
reviewContent(content: string): Promise<ReviewResult>
```

**Returns:**

```typescript
interface ReviewResult {
  approved: boolean;             // true if score >= 7
  score: number;                 // 1–10
  issues: string[];              // list of identified problems
  revision_instructions: string; // specific rewrite instructions (empty if approved)
}
```

**Review criteria:**
1. **Completeness** — Every section is fully written with substantive prose (not a skeleton/outline)
2. **LNS Voice** — Specific frameworks named, data points cited, named companies used
3. **Executive Impact** — A COO or VP Manufacturing would find this credible and actionable
4. **Fit & Finish** — No AI preamble, no raw markdown artifacts, no placeholder labels

Fails open: returns `{ approved: true, score: 8, issues: [] }` if the API call errors.

---

### `reviseContent(content, instructions, systemPrompt?)`

Rewrites `content` following the `instructions` from `reviewContent`. Preserves all substantive content — only fixes the identified issues.

```typescript
reviseContent(
  content: string,
  instructions: string,
  systemPrompt?: string
): Promise<string>
```

| Parameter | Description |
|---|---|
| `content` | Original markdown content |
| `instructions` | `revision_instructions` from `ReviewResult` |
| `systemPrompt` | Optional: inject the conversation system prompt for additional context (recommended for CDI — helps the model reference company-specific data) |

Returns the revised markdown, or the original `content` if the API call errors.

---

### `compressForPptx(content, goldExamples?)`

Condenses each `##` section so it fits on a single PowerPoint slide (≤ 700 body characters). Only calls the AI if at least one section is over the limit — short documents pass through immediately.

```typescript
compressForPptx(
  content: string,
  goldExamples?: string | null
): Promise<string>
```

| Parameter | Description |
|---|---|
| `content` | Full markdown document |
| `goldExamples` | Optional: pre-formatted examples string from a gold standard library. Pass `null` to skip. |

**What the compression pass does:**

- Converts prose paragraphs > 100 chars into 2–3 tight assertion bullets
- Removes `"Slide N:"` prefixes from `##` headings
- Cuts filler transitions ("This maps to...", "It is worth noting that...")
- Adds a compact diagnostic table to the first section that references weights inline
- **Preserves unchanged:** all numbers ($, %, correlations), named entities, direct quotes, and table rows

Returns the compressed markdown. If the output is suspiciously short (< 50% of input), returns the original content unchanged (safety guard against model hallucination).

---

### Exported Constants and Utilities

```typescript
/** Empirical body-character budget per ## section (700). */
export const PPTX_SECTION_CHAR_LIMIT: number;

/**
 * Count body characters in a markdown section.
 * Excludes table rows (|), headings (#), and separator lines (---).
 */
export function countBodyChars(section: string): number;
```

---

## Gold Standard Examples

`compressForPptx` accepts an optional `goldExamples` string — pre-formatted excerpts from analyst-nominated deliverables. The compression prompt instructs the model to match the density, bullet conciseness, and prose style of these examples.

**Fetching gold standards from CDI's DB:**

```typescript
import { getSupabase } from '@/lib/supabase';

async function fetchGoldExamples(companyId?: string): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from('gold_standard_conversations')
    .select('content_preview, label')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(3);

  if (!data?.length) return null;
  return data.map(g => `### ${g.label}\n${g.content_preview}`).join('\n\n---\n\n');
}
```

---

## Model Configuration

By default both passes use `claude-sonnet-4-6`. To use Opus for higher quality (recommended for web UI exports where latency budget is generous):

```typescript
const q = createOutputQuality({
  apiKey: process.env.ANTHROPIC_API_KEY,
  reviewModel: 'claude-opus-4-6',
  reviseModel: 'claude-opus-4-6',
});
```

For time-constrained paths (Teams bot, Supabase Edge Functions with < 150s budget), the defaults (`claude-sonnet-4-6`) keep the quality passes within budget.

---

## Usage in CDI

CDI's `src/lib/export/generate.js` uses this package for all three export formats (PPTX, DOCX, PDF). The integration pattern:

```javascript
import { createOutputQuality, countBodyChars, PPTX_SECTION_CHAR_LIMIT } from '@lns-skills/output-quality';

const q = createOutputQuality({ apiKey: process.env.ANTHROPIC_API_KEY });

// In the export pipeline:
const review = await q.reviewContent(aiResponse);
if (!review.approved) {
  aiResponse = await q.reviseContent(aiResponse, review.revision_instructions, systemPrompt);
}
aiResponse = await q.compressForPptx(aiResponse, goldExamples);
```

---

## Testing

```bash
cd output-quality
npm run build
node -e "
import('./dist/index.js').then(async ({ createOutputQuality }) => {
  const q = createOutputQuality();
  const r = await q.reviewContent('Let me help you with that...');
  console.log('Rejected conversational response:', !r.approved);
});
"
```

---

## Fail-Open Behaviour

All three methods return the original content unchanged if the API call errors or times out. This means:

- An export never fails due to a quality-pass error
- Callers do not need to wrap calls in try/catch
- Quality is best-effort, not a hard gate

This is intentional: a slightly less polished document is better than a broken export.
