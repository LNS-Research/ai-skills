# Agent Factory Setup

You are guiding the user through setting up their own multi-agent Discord bot. At the end they will be able to type questions into a Discord channel and have multiple AI agents debate, answer, and collaborate — then click Approve/Reject on the result.

Work through each step in order. Run shell commands to verify before moving on. Be conversational and clear. If a step fails, diagnose and fix it before continuing.

---

## Step 0: Welcome

Tell the user: "I'm going to walk you through setting up Agent Factory — a multi-agent system that runs in Discord. You'll be able to type questions and have Claude, local AI models, and other agents debate and answer them. This takes about 15 minutes."

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
git clone https://github.com/rdcahalane/ai-skills.git ~/projects/ai-skills
```
(If private, they may need to authenticate — walk them through `gh auth login` if needed.)

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

**E. Gemini free tier?** (last resort if they have nothing else)
If no agents were configured above: "You need at least one agent. The easiest free option is Gemini — get a free API key at https://aistudio.google.com/apikey. No credit card required."
- Walk them through getting the key
- Record `GEMINI_API_KEY=...`

Confirm with the user what agents they'll have. Show a summary like:
```
Agents configured:
  ✅ Claude CLI — /path/to/claude
  ✅ Ollama (llama3.2) — http://localhost:11434
  ❌ Codex — not available
  ❌ Gemini — not configured
```

---

## Step 4: Discord bot setup

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
DISCORD_BOT_TOKEN=[value]
DISCORD_TASK_CHANNEL_ID=[value]
DISCORD_WEBHOOK_URL=[value]
CLAUDE_BIN=[value if configured]
CODEX_BIN=[value if configured]
OLLAMA_URL=[value if configured]
OLLAMA_MODEL=[value if configured]
BEAST_URL=[value if configured]
GEMINI_API_KEY=[value if configured]
AGENT_ROUTER_ENABLED=1
ENVEOF
```

Fill in only the values that were configured. Omit lines for agents they don't have.

---

## Step 7: Start the service

```bash
cd $FACTORY_DIR && npm start
```

Watch the output for:
- `[discord-bot] logged in as YourBotName#1234` ← success
- Any error messages

If there's a database connection error:
- Check `DATABASE_URL` is correct
- For Docker: verify `docker compose ps` shows db as healthy
- For Supabase: verify the connection string includes the password

If the bot token is wrong: re-check Step 4a

Once running, tell the user to keep this terminal open (or suggest running it in the background with `npm start &` or setting up a system service later).

---

## Step 8: First test

"Let's test everything is working. Go to your Discord channel and type:"

```
What is the capital of France?
```

The bot should react with ⚡ and reply within 30 seconds with the answer from whatever agent is available.

If it works: "Perfect! Now let's try a debate."

```
!debate: Should I use Postgres or SQLite for a small side project?
```

This will start a 2-agent debate (your first two configured agents), with one playing Red Team. Watch for the round-by-round embeds appearing. After ~2 minutes you'll get an embed with Approve/Reject buttons.

---

## Step 9: Teach them the commands

Once the test succeeds, explain the command syntax:

```
What is X?                          → auto-routed to best available agent
!claude: prompt                     → force Claude CLI
!local: prompt                      → force local Ollama model
!beast: prompt                      → force remote llama.cpp node
!gemini: prompt                     → force Gemini
!codex: prompt                      → queues for next Codex session (async)

!debate: topic                      → 2-agent debate, default agents
!debate claude vs local: topic      → explicit agents
!debate claude vs local 3: topic    → 3 rounds each
!debate claude vs local --red local: topic   → explicitly set Red Team agent
```

Explain what Red Team means: "One agent always plays devil's advocate — attacks the dominant view to prevent echo chambers. By default it's your second agent."

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
- They can add more context hints by setting `CONTEXT_HINTS_JSON` in their .env
- To add a project context: `CONTEXT_HINTS_JSON=[{"pattern":"myapp","context":"MyApp is a..."}]`

"You're all set! Type a question in Discord to get started."
