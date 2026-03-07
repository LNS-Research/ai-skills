/**
 * @openbrain/triage
 *
 * AI-powered email inbox triage using Claude Haiku.
 * Classifies emails into four buckets, optionally drafts responses,
 * and learns skip rules from user feedback.
 *
 * Usage:
 *   import { EmailTriage } from "@openbrain/triage";
 *
 *   const triage = new EmailTriage({
 *     anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
 *     ownEmails: ["me@company.com", "personal@gmail.com"],
 *   });
 *
 *   const results = await triage.classify(emails, noiseRules);
 *   const draft = await triage.draft(email, "Send meeting confirmation");
 */

export type SweepClass = "dispatch" | "prep" | "yours" | "skip";
export type Priority = "high" | "medium" | "low";

export interface EmailInput {
  /** Stable identifier for this email (e.g. Gmail message ID) */
  externalId: string;
  content: string;
  metadata: {
    subject?: string;
    from?: string;
    to?: string;
    date?: string;
    [key: string]: unknown;
  };
}

export interface NoiseRule {
  /** Email domain, full address, or subject keyword to match */
  pattern: string;
  kind: "sender" | "subject";
  reason: string;
}

export interface Classification {
  externalId: string;
  sweepClass: SweepClass;
  priority: Priority;
  summary: string;
  action: string;
  dueDate?: string | null;
  durationMins?: number | null;
  alreadyReplied?: boolean;
}

export interface TriageConfig {
  anthropicApiKey: string;
  /** Your own email addresses — emails FROM these are silently skipped */
  ownEmails: string[];
  /** Claude model to use — default claude-haiku-4-5-20251001 */
  model?: string;
  /** Emails per batch sent to the model — default 15 */
  batchSize?: number;
}

export class EmailTriage {
  private config: Required<TriageConfig>;

  constructor(config: TriageConfig) {
    this.config = {
      model: "claude-haiku-4-5-20251001",
      batchSize: 15,
      ...config,
    };
  }

  /**
   * Classify a list of emails.
   * Filters out self-sent emails, collapses thread duplicates,
   * and marks threads you've already replied to.
   */
  async classify(
    emails: EmailInput[],
    noiseRules: NoiseRule[] = [],
    repliedSubjects: Set<string> = new Set(),
  ): Promise<Classification[]> {
    // Filter self-sent
    const inbound = emails.filter(e => !this.isFromSelf(e.metadata.from ?? ""));

    // Deduplicate by thread (keep latest per normalized subject)
    const deduped = this.deduplicateByThread(inbound);

    const results: Classification[] = [];
    const { batchSize } = this.config;

    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      const batchResults = await this.classifyBatch(batch, noiseRules, repliedSubjects);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Draft a professional email response.
   * Returns body text only — no subject, no salutation, no signature.
   */
  async draft(email: EmailInput, action: string): Promise<string> {
    return this.callModel(
      "You are drafting a professional email response. Return only the email body — no subject line, no 'Dear X', no signature.",
      `Draft a concise, professional response to this email.\n\nFrom: ${email.metadata.from}\nSubject: ${email.metadata.subject}\n\n${email.content.slice(0, 800)}\n\nContext: ${action}`,
      512,
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  normalizeSubject(subject: string): string {
    return subject
      .replace(/^(Re|Fwd?|FW|SV|TR):\s*/gi, "")
      .trim()
      .toLowerCase();
  }

  private isFromSelf(from: string): boolean {
    const lower = from.toLowerCase();
    return this.config.ownEmails.some(e => lower.includes(e.toLowerCase()));
  }

  private deduplicateByThread(emails: EmailInput[]): EmailInput[] {
    const latest = new Map<string, EmailInput>();
    for (const email of emails) {
      const key = this.normalizeSubject(email.metadata.subject ?? "");
      const existing = latest.get(key);
      if (!existing) {
        latest.set(key, email);
      } else {
        const existingDate = new Date((existing.metadata.date as string) ?? 0);
        const thisDate = new Date((email.metadata.date as string) ?? 0);
        if (thisDate > existingDate) latest.set(key, email);
      }
    }
    return Array.from(latest.values());
  }

  private async classifyBatch(
    emails: EmailInput[],
    noiseRules: NoiseRule[],
    repliedSubjects: Set<string>,
  ): Promise<Classification[]> {
    const summaries = emails.map(e => {
      const subject = e.metadata.subject ?? "(no subject)";
      const alreadyReplied = repliedSubjects.has(this.normalizeSubject(subject));
      return {
        externalId: e.externalId,
        subject,
        from: e.metadata.from ?? "unknown",
        date: e.metadata.date ?? "",
        snippet: e.content.slice(0, 300),
        ...(alreadyReplied ? { already_replied: true } : {}),
      };
    });

    const rulesSection = noiseRules.length > 0
      ? `\nLearned skip rules (ALWAYS classify as skip if matched):\n${noiseRules.map(r => `- ${r.kind} contains "${r.pattern}": ${r.reason}`).join("\n")}\n`
      : "";

    const prompt = `Classify these emails for a professional.${rulesSection}

Return a JSON array where each object has:
- "externalId": (string from input, unchanged)
- "sweepClass": "dispatch" | "prep" | "yours" | "skip"
  dispatch = routine, clear answer exists, or FYI
  prep = response needed, AI can draft it for review
  yours = needs personal judgment or decision
  skip = newsletters, notifications, receipts, automated alerts,
         unsolicited cold sales/outreach from unknowns,
         emails with "outreach" / "discovery call" / "I came across your profile",
         anything mass-sent. ALSO skip if already_replied is true.
- "priority": "high" | "medium" | "low"
- "summary": one sentence
- "action": one sentence on what to do (or "none" for skip)
- "dueDate": ISO date if deadline mentioned, else null
- "durationMins": estimated minutes to handle (5–60), null for skip

Emails:
${JSON.stringify(summaries, null, 2)}`;

    const raw = await this.callModel(
      "You are a precise email classifier. Return ONLY a valid JSON array — no markdown, no explanation.",
      prompt,
      4096,
    );

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleaned) as Classification[];
    } catch {
      return [];
    }
  }

  private async callModel(system: string, user: string, maxTokens: number): Promise<string> {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const d = await r.json() as { content?: { text?: string }[] };
    return d.content?.[0]?.text?.trim() ?? "";
  }
}
