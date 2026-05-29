import { execFile } from "child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface VisualAssetInput {
  kind: string;
  date: string;
  title: string;
  subtitle?: string;
  bullets: string[];
  accent?: string;
  assetRoot?: string;
  reason?: string;
}

export interface VisualAsset {
  provider: "local-svg" | "local-cli" | "comfyui" | "automatic1111" | "gemini" | "openai";
  path: string;
  mimeType: string;
  cid: string;
  alt: string;
  prompt?: string;
  dataBase64?: string;
}

export interface VisualAssetPolicy {
  mode?: string;
  provider?: string;
  style?: string;
  localCommand?: string;
  localModel?: string;
  comfyuiUrl?: string;
  comfyuiWorkflow?: string;
  comfyuiWorkflowFile?: string;
  automatic1111Url?: string;
  automatic1111Model?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiSize?: string;
  openaiQuality?: string;
  statsFile?: string;
}

type ComfyHistory = Record<string, {
  outputs?: Record<string, {
    images?: { filename: string; subfolder?: string; type?: string }[];
  }>;
}>;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanLine(s: string, max = 92): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}...` : oneLine;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function statsPath(policy: VisualAssetPolicy): string {
  return policy.statsFile || path.join(homedir(), ".claude/scripts/.image-generation-stats");
}

function outputBase(input: VisualAssetInput, provider: string, ext: string): string {
  return path.join(assetDir(input), `${input.kind}-${provider}.${ext}`);
}

function recordImageUsage(provider: string, reason: string, model: string, policy: VisualAssetPolicy): void {
  try {
    const file = statsPath(policy);
    let stats: Record<string, { count: number; providers: Record<string, number> }> = {};
    try { stats = JSON.parse(readFileSync(file, "utf8")); } catch {}
    const key = reason || "unspecified";
    const providerKey = `${provider}:${model}`;
    if (!stats[key]) stats[key] = { count: 0, providers: {} };
    stats[key].count++;
    stats[key].providers[providerKey] = (stats[key].providers[providerKey] ?? 0) + 1;
    writeFileSync(file, JSON.stringify(stats), "utf8");
  } catch {}
}

function assetDir(input: VisualAssetInput): string {
  const root = input.assetRoot || path.join(process.cwd(), "data", "newsletter-assets");
  const dir = path.join(root, input.date);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildVisualPrompt(input: VisualAssetInput): string {
  return [
    `Create a polished visual asset for OpenBrain.`,
    `Kind: ${input.kind}`,
    `Title: ${input.title}`,
    input.subtitle ? `Subtitle: ${input.subtitle}` : "",
    `Style: restrained editorial analytics, dark zinc UI, crisp professional composition, no cartoon look, no fake charts, no logos.`,
    `Content cues: ${input.bullets.slice(0, 5).join("; ")}`,
    `Avoid tiny illegible text. If text is used, keep it minimal and high contrast.`,
  ].filter(Boolean).join("\n");
}

async function tryLocalCommand(input: VisualAssetInput, prompt: string, policy: VisualAssetPolicy): Promise<VisualAsset | null> {
  const template = policy.localCommand || process.env.OPENBRAIN_IMAGEGEN_CMD;
  if (!template) return null;

  const dir = assetDir(input);
  const promptFile = path.join(dir, `${input.kind}-prompt.txt`);
  const output = path.join(dir, `${input.kind}-local.png`);
  writeFileSync(promptFile, prompt, "utf8");

  const command = template
    .replaceAll("{promptFile}", shellQuote(promptFile))
    .replaceAll("{output}", shellQuote(output));

  try {
    await execFileAsync("/bin/zsh", ["-lc", command], { timeout: 10 * 60 * 1000 });
    if (!existsSync(output)) return null;
    recordImageUsage("local-cli", input.reason || "visual-asset", policy.localModel || "local", policy);
    return {
      provider: "local-cli",
      path: output,
      mimeType: "image/png",
      cid: `${input.kind}-${input.date}@openbrain`,
      alt: `${input.title} visual`,
      prompt,
    };
  } catch (err) {
    console.warn("[visual-service] local image command failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function replaceWorkflowPlaceholders(workflow: string, input: VisualAssetInput, prompt: string): string {
  const jsonStringContent = (s: string) => JSON.stringify(s).slice(1, -1);
  return workflow
    .replaceAll("{{prompt}}", jsonStringContent(prompt))
    .replaceAll("{{negative_prompt}}", jsonStringContent("low quality, blurry, illegible tiny text, malformed charts, logos, watermark"))
    .replaceAll("{{title}}", jsonStringContent(input.title))
    .replaceAll("{{kind}}", jsonStringContent(input.kind));
}

async function tryComfyUI(input: VisualAssetInput, prompt: string, policy: VisualAssetPolicy): Promise<VisualAsset | null> {
  const baseUrl = (policy.comfyuiUrl || process.env.COMFYUI_URL || "").replace(/\/$/, "");
  const workflowTemplate = policy.comfyuiWorkflow
    || process.env.COMFYUI_WORKFLOW_JSON
    || (policy.comfyuiWorkflowFile || process.env.COMFYUI_WORKFLOW_FILE
      ? readFileSync(policy.comfyuiWorkflowFile || process.env.COMFYUI_WORKFLOW_FILE || "", "utf8")
      : "");
  if (!baseUrl || !workflowTemplate) return null;

  try {
    const workflow = JSON.parse(replaceWorkflowPlaceholders(workflowTemplate, input, prompt));
    const queueRes = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: `openbrain-${Date.now()}` }),
      signal: AbortSignal.timeout(30_000),
    });
    const queueData = await queueRes.json() as { prompt_id?: string; error?: unknown };
    if (!queueRes.ok || !queueData.prompt_id) throw new Error(`ComfyUI queue failed: ${JSON.stringify(queueData.error ?? queueData).slice(0, 500)}`);

    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const historyRes = await fetch(`${baseUrl}/history/${queueData.prompt_id}`, { signal: AbortSignal.timeout(30_000) });
      if (!historyRes.ok) continue;
      const history = await historyRes.json() as ComfyHistory;
      const run = history[queueData.prompt_id];
      const image = Object.values(run?.outputs || {}).flatMap(output => output.images || [])[0];
      if (!image) continue;

      const view = new URL(`${baseUrl}/view`);
      view.searchParams.set("filename", image.filename);
      if (image.subfolder) view.searchParams.set("subfolder", image.subfolder);
      if (image.type) view.searchParams.set("type", image.type);
      const imageRes = await fetch(view, { signal: AbortSignal.timeout(60_000) });
      if (!imageRes.ok) throw new Error(`ComfyUI image fetch HTTP ${imageRes.status}`);
      const bytes = Buffer.from(await imageRes.arrayBuffer());
      const output = outputBase(input, "comfyui", image.filename.toLowerCase().endsWith(".webp") ? "webp" : "png");
      writeFileSync(output, bytes);
      recordImageUsage("comfyui", input.reason || "visual-asset", process.env.COMFYUI_MODEL || policy.localModel || "workflow", policy);
      return {
        provider: "comfyui",
        path: output,
        mimeType: output.endsWith(".webp") ? "image/webp" : "image/png",
        cid: `${input.kind}-${input.date}@openbrain`,
        alt: `${input.title} visual`,
        prompt,
      };
    }
    throw new Error("ComfyUI generation timed out");
  } catch (err) {
    console.warn("[visual-service] ComfyUI generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function tryAutomatic1111(input: VisualAssetInput, prompt: string, policy: VisualAssetPolicy): Promise<VisualAsset | null> {
  const baseUrl = (policy.automatic1111Url || process.env.AUTOMATIC1111_URL || process.env.FORGE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return null;

  const model = policy.automatic1111Model || process.env.AUTOMATIC1111_MODEL || process.env.FORGE_MODEL || "default";
  try {
    const res = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        negative_prompt: "low quality, blurry, illegible tiny text, malformed charts, logos, watermark",
        width: Number(process.env.OPENBRAIN_IMAGE_WIDTH || 1216),
        height: Number(process.env.OPENBRAIN_IMAGE_HEIGHT || 704),
        steps: Number(process.env.OPENBRAIN_IMAGE_STEPS || 24),
        cfg_scale: Number(process.env.OPENBRAIN_IMAGE_CFG_SCALE || 5.5),
        sampler_name: process.env.OPENBRAIN_IMAGE_SAMPLER || "DPM++ 2M Karras",
        batch_size: 1,
        n_iter: 1,
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const data = await res.json() as { images?: string[]; error?: string; detail?: unknown };
    if (!res.ok || data.error) throw new Error(data.error || `Automatic1111 HTTP ${res.status}`);
    const image = data.images?.[0];
    if (!image) return null;
    const clean = image.includes(",") ? image.split(",").pop() || image : image;
    const output = outputBase(input, "automatic1111", "png");
    writeFileSync(output, Buffer.from(clean, "base64"));
    recordImageUsage("automatic1111", input.reason || "visual-asset", model, policy);
    return {
      provider: "automatic1111",
      path: output,
      mimeType: "image/png",
      cid: `${input.kind}-${input.date}@openbrain`,
      alt: `${input.title} visual`,
      prompt,
    };
  } catch (err) {
    console.warn("[visual-service] Automatic1111/Forge generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function tryGemini(input: VisualAssetInput, prompt: string, policy: VisualAssetPolicy): Promise<VisualAsset | null> {
  const key = policy.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = policy.geminiModel || process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json() as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
      error?: { message?: string };
    };
    if (!res.ok || data.error) throw new Error(data.error?.message || `Gemini image HTTP ${res.status}`);
    const image = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
    if (!image?.data) return null;
    const ext = image.mimeType?.includes("webp") ? "webp" : "png";
    const output = path.join(assetDir(input), `${input.kind}-gemini.${ext}`);
    writeFileSync(output, Buffer.from(image.data, "base64"));
    recordImageUsage("gemini", input.reason || "visual-asset", model, policy);
    return {
      provider: "gemini",
      path: output,
      mimeType: image.mimeType || "image/png",
      cid: `${input.kind}-${input.date}@openbrain`,
      alt: `${input.title} visual`,
      prompt,
    };
  } catch (err) {
    console.warn("[visual-service] Gemini image generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function tryOpenAI(input: VisualAssetInput, prompt: string, policy: VisualAssetPolicy): Promise<VisualAsset | null> {
  const key = policy.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = policy.openaiModel || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        prompt,
        size: policy.openaiSize || process.env.OPENBRAIN_NEWSLETTER_IMAGE_SIZE || "1024x1024",
        quality: policy.openaiQuality || process.env.OPENBRAIN_NEWSLETTER_IMAGE_QUALITY || "low",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json() as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (!res.ok || data.error) throw new Error(data.error?.message || `OpenAI image HTTP ${res.status}`);
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;
    const output = path.join(assetDir(input), `${input.kind}-openai.png`);
    writeFileSync(output, Buffer.from(b64, "base64"));
    recordImageUsage("openai", input.reason || "visual-asset", model, policy);
    return {
      provider: "openai",
      path: output,
      mimeType: "image/png",
      cid: `${input.kind}-${input.date}@openbrain`,
      alt: `${input.title} visual`,
      prompt,
    };
  } catch (err) {
    console.warn("[visual-service] OpenAI image generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function makeLocalSvg(input: VisualAssetInput, policy: VisualAssetPolicy): VisualAsset {
  const output = path.join(assetDir(input), `${input.kind}-card.svg`);
  const accent = input.accent || "#38bdf8";
  const bullets = input.bullets.slice(0, 5).map(b => cleanLine(b));
  const rows = bullets.map((b, i) => {
    const y = 246 + i * 58;
    const width = 360 + Math.max(40, Math.min(520, b.length * 5));
    return `
      <rect x="72" y="${y - 22}" width="${width}" height="38" rx="8" fill="#18181b" stroke="#3f3f46"/>
      <circle cx="96" cy="${y - 3}" r="5" fill="${accent}"/>
      <text x="116" y="${y + 3}" font-size="22" fill="#e4e4e7">${escapeXml(b)}</text>`;
  }).join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <rect width="1200" height="720" fill="#09090b"/>
  <rect x="48" y="48" width="1104" height="624" rx="14" fill="#111113" stroke="#27272a" stroke-width="2"/>
  <rect x="48" y="48" width="1104" height="10" fill="${accent}"/>
  <text x="72" y="128" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="28" fill="#a1a1aa">${escapeXml(input.date)}</text>
  <text x="72" y="188" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="48" font-weight="700" fill="#fafafa">${escapeXml(cleanLine(input.title, 42))}</text>
  ${input.subtitle ? `<text x="72" y="226" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="24" fill="#d4d4d8">${escapeXml(cleanLine(input.subtitle, 74))}</text>` : ""}
  <g font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${rows}</g>
  <text x="72" y="624" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" fill="#71717a">OpenBrain local visual - no cloud image spend</text>
  <circle cx="1058" cy="568" r="72" fill="none" stroke="${accent}" stroke-width="18" opacity="0.75"/>
  <circle cx="1058" cy="568" r="34" fill="${accent}" opacity="0.25"/>
</svg>`;
  writeFileSync(output, svg, "utf8");
  recordImageUsage("local-svg", input.reason || "visual-asset", "svg-card", policy);
  return {
    provider: "local-svg",
    path: output,
    mimeType: "image/svg+xml",
    cid: `${input.kind}-${input.date}@openbrain`,
    alt: `${input.title} visual`,
    prompt: buildVisualPrompt(input),
  };
}

export async function generateVisualAsset(input: VisualAssetInput, policy: VisualAssetPolicy = {}): Promise<VisualAsset | null> {
  const mode = (policy.mode || process.env.OPENBRAIN_NEWSLETTER_IMAGES || "local").toLowerCase();
  if (mode === "off") return null;

  const prompt = buildVisualPrompt(input);
  const provider = (policy.provider || process.env.OPENBRAIN_NEWSLETTER_IMAGE_PROVIDER || "auto").toLowerCase();
  const cloudAllowed = mode === "cloud" || mode === "auto";

  if (provider === "local-svg") return makeLocalSvg(input, policy);
  if (provider === "local-cli") return await tryLocalCommand(input, prompt, policy) ?? makeLocalSvg(input, policy);
  if (provider === "comfyui") return await tryComfyUI(input, prompt, policy) ?? makeLocalSvg(input, policy);
  if (provider === "automatic1111" || provider === "forge") return await tryAutomatic1111(input, prompt, policy) ?? makeLocalSvg(input, policy);
  if (provider === "gemini" && cloudAllowed) return await tryGemini(input, prompt, policy) ?? makeLocalSvg(input, policy);
  if (provider === "openai" && cloudAllowed) return await tryOpenAI(input, prompt, policy) ?? makeLocalSvg(input, policy);

  const comfy = await tryComfyUI(input, prompt, policy);
  if (comfy) return comfy;

  const automatic1111 = await tryAutomatic1111(input, prompt, policy);
  if (automatic1111) return automatic1111;

  const local = await tryLocalCommand(input, prompt, policy);
  if (local) return local;

  if (cloudAllowed && (policy.style || process.env.OPENBRAIN_NEWSLETTER_IMAGE_STYLE) === "editorial") {
    return await tryGemini(input, prompt, policy)
      ?? await tryOpenAI(input, prompt, policy)
      ?? makeLocalSvg(input, policy);
  }

  return makeLocalSvg(input, policy);
}
