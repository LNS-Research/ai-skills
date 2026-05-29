import dotenv from "dotenv";
import express from "express";
import { readFileSync } from "fs";
import { generateVisualAsset, type VisualAssetInput, type VisualAssetPolicy } from "./index.js";

dotenv.config({ path: process.env.OPENBRAIN_ENV_PATH || ".env" });

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = parseInt(process.env.VISUAL_SERVICE_PORT || "3225", 10);
const HOST = process.env.VISUAL_SERVICE_HOST || "127.0.0.1";
const TOKEN = process.env.VISUAL_SERVICE_TOKEN || "";

function authorized(req: express.Request): boolean {
  if (!TOKEN) return true;
  return req.headers.authorization?.replace("Bearer ", "") === TOKEN;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.OPENBRAIN_NEWSLETTER_IMAGES || "local",
    provider: process.env.OPENBRAIN_NEWSLETTER_IMAGE_PROVIDER || "auto",
    backends: {
      comfyui: !!process.env.COMFYUI_URL,
      automatic1111: !!(process.env.AUTOMATIC1111_URL || process.env.FORGE_URL),
      localCli: !!process.env.OPENBRAIN_IMAGEGEN_CMD,
      gemini: !!process.env.GEMINI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    },
  });
});

app.post("/visuals", async (req, res) => {
  if (!authorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const body = req.body as Partial<VisualAssetInput> & { includeData?: boolean; policy?: VisualAssetPolicy };
    if (!body.title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const visual = await generateVisualAsset({
      kind: body.kind || "general",
      date: body.date || new Date().toISOString().slice(0, 10),
      title: body.title,
      subtitle: body.subtitle,
      bullets: Array.isArray(body.bullets) ? body.bullets.map(String) : [],
      accent: body.accent,
      assetRoot: body.assetRoot,
      reason: body.reason,
    }, body.policy || {});
    let responseVisual = visual;
    if (visual && body.includeData) {
      try {
        responseVisual = {
          ...visual,
          dataBase64: readFileSync(visual.path).toString("base64"),
        } as typeof visual & { dataBase64: string };
      } catch (err) {
        console.warn("[visual-service] could not attach asset data:", err instanceof Error ? err.message : err);
      }
    }
    res.json({ ok: !!responseVisual, visual: responseVisual });
  } catch (err) {
    console.error("[visual-service] error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`OpenBrain visual service running on http://${HOST}:${PORT}`);
});
