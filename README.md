# LNS AI Skills

Shared AI infrastructure packages used by CDI and other LNS projects.

All packages are **config-driven** — no hardcoded credentials, personal data, or org-specific logic. Everything sensitive goes in `.env` or is passed as constructor config.

## Packages

| Package | Description |
|---|---|
| [`hybrid-search`](hybrid-search/) | Semantic + keyword search over pgvector/Postgres via Reciprocal Rank Fusion |
| [`triage`](triage/) | AI email triage — classify as dispatch/prep/yours/skip, draft responses, learn noise rules |
| [`capture`](capture/) | Universal knowledge capture — embed + extract metadata + dedup-upsert into pgvector |
| [`ai-router`](ai-router/) | Model routing — Haiku (fast), Sonnet (reasoning), Ollama local with Haiku fallback |
| [`email-draft`](email-draft/) | Push drafts to Gmail Drafts (API) or Apple Mail Drafts (JXA) — macOS |

## Quick start

```bash
npm install          # installs all workspaces
npm run build        # builds all packages
```

## Using in CDI or another project

During development (before publishing to GitHub Packages):
```json
// package.json
"dependencies": {
  "@openbrain/hybrid-search": "file:../ai-skills/hybrid-search"
}
```

Once published to GitHub Packages:
```json
"dependencies": {
  "@openbrain/hybrid-search": "1.0.0"
}
```

Add to `~/.npmrc` (never commit this):
```
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
@openbrain:registry=https://npm.pkg.github.com
```

## Adding a new skill

1. `mkdir my-skill && cd my-skill`
2. Create `package.json` with `"name": "@openbrain/my-skill"` and `"type": "module"`
3. Create `src/index.ts` — all config via constructor/factory params, zero hardcoded data
4. Add to `workspaces` in root `package.json`
5. Open a PR

## Security rules

- **Never** commit API keys, tokens, email addresses, or OAuth credentials
- All personal/org config is passed as runtime parameters from the caller's `.env`
- Run `npx secretlint "**/*"` before committing if you're unsure
