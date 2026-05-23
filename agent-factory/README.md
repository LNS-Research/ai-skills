# agent-factory

Multi-agent Discord bot. Ask questions in Discord, get answers from multiple AI agents. Supports debates with a built-in Red Team to prevent echo chambers.

## Quick start (for friends)

1. Clone this repo
2. `cd agent-factory`
3. Open Claude Code: `claude`
4. Run: `/setup-agent-factory`

Claude will walk you through everything interactively — Discord bot setup, database, which agents you have available, and your first test debate.

## Agents supported

| Agent | Requires | Cost |
|-------|----------|------|
| Claude CLI | Claude Max subscription | $0/query |
| Codex CLI | OpenAI subscription + Codex app | $0/query |
| Ollama (local) | 8GB+ RAM, free download | $0 |
| Remote llama.cpp | Another machine on your network | $0 |
| Gemini API | Free API key (aistudio.google.com) | $0 (free tier) |

Goal: use subscription and local agents. Avoid per-token API keys.

## Discord commands

```
What is X?                          → auto-routed to best agent
!claude: prompt                     → force Claude CLI
!local: prompt                      → force Ollama
!gemini: prompt                     → force Gemini

!debate: topic                      → 2-agent debate
!debate claude vs local: topic      → explicit agents
!debate claude vs local 3: topic    → 3 cycles each
!debate claude vs local --red local: topic  → set Red Team agent
```

After a debate, a Discord embed appears with **Approve & Execute / Reject / Ask Claude** buttons.

## Task routing

| Task type | Default route |
|-----------|---------------|
| `summarize`, `commit_msg`, `boilerplate`, `explain_fn`, `seed_data`, `docstring`, `refactor_simple` | Local model (beast → Ollama → Claude fallback) |
| `long_doc`, `vision`, `pdf_analysis` | Gemini |
| `chat`, everything else | Claude |

## Configuration

Copy `.env.example` to `.env` and fill in what you have. Only configure agents you actually have access to — unconfigured agents are skipped automatically.

```bash
cp .env.example .env
```

Key settings:
- `CONTEXT_HINTS_JSON` — auto-inject project context when a debate topic matches a keyword
- `AGENT_ROUTER_ENABLED=1` — must be set for the coordinator to process tasks
- `DISCORD_TASK_CHANNEL_ID` — restrict bot to one channel (recommended)
