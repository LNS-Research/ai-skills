# Agent Factory Setup

You are guiding the user through setting up Agent Factory — a multi-agent AI system where Claude, Gemini, local models, and Codex debate questions together and surface a recommended action for your approval.

Work through each step in order. Run shell commands to verify before moving on. Be conversational and clear. If a step fails, diagnose and fix it before continuing.

---

## Step 0: Why Agent Factory / What you'll get

Tell the user:

**"Here's what Agent Factory does:**

Most AI tools give you one model's answer. Agent Factory gives you a debate — Claude takes one side, a local model (or Gemini) takes another, a Red Team agent attacks the consensus, and a synthesis agent weighs all the arguments and surfaces a proposed action. You click Approve or Reject.

**What you'll end up with:**
- A background service that listens for questions
- 2–5 AI agents that debate, challenge each other, and reach a consensus
- Approve/Reject buttons on the final recommendation
- Routing that sends cheap/simple tasks to free local models and saves API quota for complex ones

**Two ways to interact — pick one:**

**Option A — Discord bot**
You type questions in a Discord channel from any device (phone, desktop, anywhere). Great if you already use Discord or want to access it on mobile.

**Option B — Local file**
Two markdown files in a folder: write your question in `inbox.md`, read the reply in `conversation.md`. No Discord account needed. Great for desktop-only use or if you want everything local.

You can run both at once if you want (`TRANSPORT=both`).

Which would you prefer? **(Discord / File / Both)**"

Store their answer as `TRANSPORT_CHOICE`. Use it throughout to skip irrelevant steps.

Ask: "What's your operating system? (macOS / Windows WSL / Linux)"

Store their answer for later steps.

---

## Step 1: Prerequisites

Run these checks and tell the user what you found:

```bash
node --version
npm --version
git --version
which docker 2>/dev/null && docker --version || echo "Docker not found"
which claude 2>/dev/null || echo "Claude CLI not found"
```

- Node 18+ required. If missing: direct them to nodejs.org
- Docker optional — used for Postgres if they don't have Supabase/Railway

---

## Step 2: Clone / locate the repo

Check if they already have it:
```bash
ls ~/projects/ai-skills/agent-factory/src/index.ts 2>/dev/null && echo "found" || echo "not found"
```

If found: tell them it's already there, ask what directory to use for their `.env`.

If not found, ask: "Do you want me to clone the ai-skills repo, or do you already have it somewhere?"

If cloning:
```bash
git clone https://github.com/LNS-Research/ai-skills.git ~/projects/ai-skills
```

Set `FACTORY_DIR` to the agent-factory directory path. Default: `~/projects/ai-skills/agent-factory`

Install dependencies:
```bash
cd $FACTORY_DIR && npm install
```

---

## Step 3: Detect available agents

Tell the user: "Now let's figure out which AI agents you have access to. The goal is to avoid API keys that charge per-use — we'll use subscription-based CLI tools and free local models where possible."

Ask these questions one at a time and record answers:

**A. Claude Max subscription?**
"Do you have a Claude Max subscription (claude.ai)? This gives you Claude CLI at no extra cost per query."
- Yes → check: `which claude` — if found, record `CLAUDE_BIN=$(which claude)`. If not: `npm install -g @anthropic-ai/claude-code` then check again
- No → skip Claude agent

**B. Codex / OpenAI subscription?**
"Do you have an OpenAI subscription with Codex desktop app?"
- Yes (Mac) → check: `ls /Applications/Codex.app 2>/dev/null && echo found || echo missing`
  - If found: record `CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex`
  - If missing: ask them to open Codex at least once first
- Yes (other) → skip for now
- No → skip

**C. Local model via Ollama?**
"Do you have Ollama installed, or want to run a free local model? (Ollama runs AI on your own machine — free, private, but needs 8GB+ RAM)"
- Yes, already installed → check: `which ollama && ollama list`
  - Record `OLLAMA_URL=http://localhost:11434` and ask which model they have (or suggest `llama3.2`)
  - Set `OLLAMA_MODEL=llama3.2` (or whatever they have)
- No, want to install → direct them to https://ollama.ai, then run: `ollama pull llama3.2`
  - Wait for them to confirm, then verify: `ollama list`
- No, skip → continue

**D. Another machine running a local model?** (optional)
"Do you have another computer (or server) running llama.cpp or similar, accessible on your network or Tailscale?"
- Yes → ask for its IP/URL, record as `BEAST_URL=http://x.x.x.x:8081`
- No → skip

**E. Gemini CLI (free, no API key)?**
"Gemini CLI authenticates via your Google account — no API key, no cost. Install with: `npm install -g @google/gemini-cli` then: `gemini auth`"
- Check: `which gemini 2>/dev/null && echo found || echo missing`
- If found: record `GEMINI_BIN=$(which gemini)` — no API key needed
- If not found and they want it: `npm install -g @google/gemini-cli` → `gemini auth`
- Skip if they have at least 2 other agents

Confirm with the user what agents they'll have. Show a summary like:
```
Agents configured:
  ✅ Claude CLI — /path/to/claude
  ✅ Ollama (llama3.2) — http://localhost:11434
  ✅ Gemini CLI — /opt/homebrew/bin/gemini (no API key)
  ❌ Codex — not available
  ❌ Beast remote — not configured
```

---

## Step 4: Discord bot setup (skip if TRANSPORT_CHOICE = "File")

Tell the user: "Now we'll create a Discord bot. This takes about 5 minutes in the Discord Developer Portal."

### 4a. Create the bot

"Go to https://discord.com/developers/applications and follow these steps:"

Walk them through step by step, waiting for confirmation at each:
1. Click **New Application** → name it (suggest: "AgentFactory" or their own name)
2. Left sidebar → **Bot** → click **Add Bot**
3. Under **Privileged Gateway Intents**, enable **Message Content Intent** → Save
4. Under **Token** → click **Reset Token** → copy it
   "Paste the bot token here (I'll save it to your .env — it won't appear in logs)"
   Record as `DISCORD_BOT_TOKEN=...`

### 4b. Invite the bot to your server

"Now invite the bot to your Discord server."

1. Left sidebar → **OAuth2** → **URL Generator**
2. Scopes: check `bot`
3. Bot Permissions: check `Send Messages`, `Read Message History`, `Read Messages/View Channels`, `Add Reactions`, `Use Slash Commands`, `Embed Links`
4. Copy the generated URL → open in browser → select your server → Authorize

Verify: "Is the bot now showing as a member of your server?"

### 4c. Create webhook and get channel ID

"In your Discord server:"
1. Go to the channel you want the bot to use
2. Right-click the channel → **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook** → **Copy Webhook URL**
   Record as `DISCORD_WEBHOOK_URL=...`
3. Right-click the channel name → **Copy Channel ID** (need Developer Mode: User Settings → Advanced → Developer Mode)
   Record as `DISCORD_TASK_CHANNEL_ID=...`

---

## Step 4F: File transport setup (skip if TRANSPORT_CHOICE = "Discord")

Tell the user:

"File transport uses two markdown files:
- **inbox.md** — you write questions here, one line per question, save the file
- **conversation.md** — Agent Factory appends questions + answers here

The service watches `inbox.md` for changes and clears it immediately when it picks up a message, so you always know it was received."

Ask: "Where do you want this conversation folder? (default: `~/agent-chats`)"

Record as `CONVERSATION_DIR` (default: `~/agent-chats`)

Create the folder:
```bash
mkdir -p $CONVERSATION_DIR
```

Show them the command syntax for file mode:
```
Write to inbox.md:
  Your question here                → auto-routed
  !debate: topic                    → multi-agent debate
  !claude: prompt                   → force Claude
  !local: prompt                    → force local/Ollama
  !gemini: prompt                   → force Gemini

After a debate, to act on the proposal:
  !approve                          → execute the proposed action
  !reject                           → dismiss it
  !ask: follow-up question          → ask agents to elaborate
```

---

## Step 5: Database setup

Ask: "For the database, which path do you prefer?"

**Option A: Docker (easiest, runs locally)**
"Requires Docker Desktop installed and running."
- Check: `docker ps 2>/dev/null && echo "Docker running" || echo "Docker not running"`
- If running:
  ```bash
  cd $FACTORY_DIR && docker compose up -d
  sleep 5
  docker compose ps
  ```
  Set `DATABASE_URL=postgresql://agent:agentfactory@localhost:5432/agent_factory`

**Option B: Supabase (no Docker, cloud hosted, free tier)**
"Go to https://supabase.com → New Project → fill in name/password → Create"
"Once created: Settings → Database → Connection string (URI mode) → copy it"
- They paste the connection string
- Record as `DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`
- Run the schema:
  ```bash
  psql "$DATABASE_URL" -f $FACTORY_DIR/schema.sql
  ```
  If psql not installed on Mac: `brew install libpq && brew link --force libpq`

Verify the table exists:
```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM agent_tasks;"
```
Expected: `0` (empty table, no error).

---

## Step 6: Write .env

Now write the .env file based on everything collected:

```bash
cat > $FACTORY_DIR/.env << 'ENVEOF'
DATABASE_URL=[value]
TRANSPORT=[discord|file|both based on TRANSPORT_CHOICE]

# Discord (only if transport includes discord)
DISCORD_BOT_TOKEN=[value]
DISCORD_TASK_CHANNEL_ID=[value]
DISCORD_WEBHOOK_URL=[value]

# File transport (only if transport includes file)
CONVERSATION_DIR=[value if configured]

# Agents — only include lines for configured agents
CLAUDE_BIN=[value if configured]
CODEX_BIN=[value if configured]
OLLAMA_URL=[value if configured]
OLLAMA_MODEL=[value if configured]
BEAST_URL=[value if configured]
GEMINI_BIN=[value if configured]

AGENT_ROUTER_ENABLED=1
ENVEOF
```

Fill in only the values that were configured. Omit lines for agents they don't have.

---

## Step 7: Start the service

```bash
cd $FACTORY_DIR && npm start
```

**For Discord transport**, watch for:
- `[discord-bot] logged in as YourBotName#1234` ← success
- Any error messages

**For file transport**, watch for:
- `[file-bot] watching inbox.md` ← success

If there's a database connection error:
- Check `DATABASE_URL` is correct
- For Docker: verify `docker compose ps` shows db as healthy
- For Supabase: verify the connection string includes the password

If the bot token is wrong: re-check Step 4a

Once running, tell the user to keep this terminal open (or suggest running it in the background with `npm start &` or setting up a system service later).

---

## Step 8: First test

**Discord transport:**
"Go to your Discord channel and type:"
```
What is the capital of France?
```
The bot should react with ⚡ and reply within 30 seconds.

**File transport:**
"Open `$CONVERSATION_DIR/inbox.md` and write:"
```
What is the capital of France?
```
Save the file. The inbox will clear immediately (picked up), and the answer will appear in `conversation.md` within 30 seconds.

If it works: "Now let's try a debate."

**Discord:**
```
!debate: Should I use Postgres or SQLite for a small side project?
```

**File (write to inbox.md):**
```
!debate: Should I use Postgres or SQLite for a small side project?
```

Watch for the debate to complete (2–4 minutes). You'll get a synthesis with a proposed action. In Discord: Approve/Reject buttons appear. In file mode: write `!approve` or `!reject` in inbox.md.

---

## Step 9: Teach them the commands

Once the test succeeds, explain the full command reference:

```
What is X?                          → auto-routed to best available agent
!claude: prompt                     → force Claude CLI
!local: prompt                      → force local Ollama model
!beast: prompt                      → force remote llama.cpp node
!gemini: prompt                     → force Gemini CLI (free)
!codex: prompt                      → queues for next Codex session (async)

!debate: topic                      → 2-agent debate, default agents
!debate claude vs local: topic      → explicit agents
!debate claude vs local 3: topic    → 3 rounds each
!debate claude vs local --red local: topic   → explicitly set Red Team agent
```

**After a debate (Discord):** Approve / Reject / Ask buttons appear on the synthesis embed.
**After a debate (file):** Write `!approve`, `!reject`, or `!ask: your follow-up` in inbox.md.

Explain what Red Team means: "One agent always plays devil's advocate — attacks the dominant view to prevent echo chambers. By default it's your second agent."

Explain auto-routing: "Boilerplate, summarize, and commit_msg tasks automatically go to your cheapest available agent (local model > Beast > Claude) to save API quota."

---

## Step 10: Optional — run as a background service

"Want this to start automatically when your computer boots?"

**macOS (launchd):**
```bash
cat > ~/Library/LaunchAgents/com.agentfactory.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agentfactory</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>--import</string><string>tsx/esm</string>
    <string>FACTORY_DIR/src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>FACTORY_DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>NODE_ENV</key><string>production</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/agent-factory.log</string>
  <key>StandardErrorPath</key><string>/tmp/agent-factory.err</string>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.agentfactory.plist
```
(Replace `FACTORY_DIR` with the actual path.)

**Linux (systemd):**
Offer to write a systemd unit file if they want.

**Windows WSL:**
Suggest running in a tmux session or Windows Task Scheduler targeting the WSL path.

---

## Finish

Tell them:
- The service polls for new tasks every 10 seconds
- Debates take 1-4 minutes depending on agents and rounds
- Local models (Ollama) are slower but free and private
- Gemini CLI is free via Google account auth — good second debater if you don't have Ollama
- They can add context hints by setting `CONTEXT_HINTS_JSON` in their .env
  - Example: `CONTEXT_HINTS_JSON=[{"pattern":"myapp","context":"MyApp is a..."}]`
- To run both Discord and file at once: `TRANSPORT=both` in .env

"You're all set. Ask it something hard."
