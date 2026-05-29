export type SetupBy = "self" | "family" | "care_partner" | "clinician" | string;
export type SupportMode = "independent" | "assisted" | "care_partner_led" | string;

export type RecoveryProfile = {
  survivor_name?: string;
  setup_by?: SetupBy;
  support_mode?: SupportMode;
  injury_context?: string;
  current_stage?: string;
  affected_areas?: string[];
  strengths?: string[];
  harder_things?: string[];
  overload_triggers?: string[];
  helpful_supports?: string[];
  communication_preferences?: string[];
  care_partners?: RecoveryCarePartner[];
  never_share?: string[];
  appointment_priorities?: string[];
};

export type RecoveryCarePartner = {
  name: string;
  role?: string;
  can_share?: string;
  contact?: string;
};

export type RecoveryItem = {
  id: string;
  content: string;
  source: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RecoveryPerson = {
  id: string;
  name: string;
  relationship: string | null;
  context: Record<string, unknown>;
  contact: string | null;
  last_interaction: string | null;
};

export type RecoveryProfileRecord = {
  id: string;
  profile: RecoveryProfile;
  created_at: string;
} | null;

export type RecoverySignal = {
  id: string;
  title: string;
  text: string;
  source: string;
  created_at: string;
};

export type RecoveryDailyInput = {
  now?: Date;
  profileRecord: RecoveryProfileRecord;
  events: RecoveryItem[];
  openTodos: RecoveryItem[];
  recentItems: RecoveryItem[];
  people: RecoveryPerson[];
};

export type RecoveryDailyView = {
  profile: (RecoveryProfile & { id: string; created_at: string }) | null;
  onboarding: { completed: boolean; mode: string; setupBy: string; nextPrompt: string };
  today: {
    date: string;
    energy: { score: number; load: number; supports: string[] };
    events: { id: string; title: string; start?: string; end?: string; location?: string }[];
    essentials: { id: string; title: string; text: string; priority: string; source: string }[];
  };
  checkInPrompts: string[];
  memory: {
    carePeople: {
      id: string;
      name: string;
      relationship: string | null;
      daysSince: number | null;
      context: Record<string, unknown>;
      contact: string | null;
      source: string;
    }[];
    recentWins: RecoverySignal[];
    recentHardThings: RecoverySignal[];
    symptoms: RecoverySignal[];
  };
  careCircle: { enabledByDefault: boolean; note: string; draft: string };
  recoveryPrinciples: string[];
};

export type RecoveryVaultExport = {
  exportedAt: string;
  format: "markdown-vault";
  files: { path: string; content: string }[];
};

export type RecoveryVaultInput = {
  profileRecord: RecoveryProfileRecord;
  checkIns: RecoveryItem[];
  careBriefs: RecoveryItem[];
  events: RecoveryItem[];
  patternReview?: RecoveryPatternReview;
  exportedAt?: Date;
};

export type RecoveryPatternBucket = {
  title: string;
  count: number;
  evidence: string[];
};

export type RecoveryPatternReviewInput = {
  profileRecord: RecoveryProfileRecord;
  checkIns: RecoveryItem[];
  events: RecoveryItem[];
  openTodos: RecoveryItem[];
  careBriefs: RecoveryItem[];
  recentItems: RecoveryItem[];
  windowDays?: number;
  now?: Date;
};

export type RecoveryPatternReview = {
  window: { days: number; start: string; end: string };
  energy: { average: number | null; lowDays: number; entries: number };
  patterns: {
    overload: RecoveryPatternBucket[];
    supports: RecoveryPatternBucket[];
    hardThings: RecoveryPatternBucket[];
    wins: RecoveryPatternBucket[];
  };
  suggestedAdjustments: string[];
  careCircleDraft: string;
  appointmentPrep: string[];
  reviewMarkdown: string;
};

export type RecoveryProfileInput = RecoveryProfile & {
  affectedAreas?: string | string[];
  harderThings?: string | string[];
  overloadTriggers?: string | string[];
  helpfulSupports?: string | string[];
  communicationPreferences?: string | string[];
  carePartners?: string | RecoveryCarePartner[];
  neverShare?: string | string[];
  appointmentPriorities?: string | string[];
};

export function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value.replace(/\u202f/g, " ").replace(/^[A-Za-z]+,\s*/, "").replace(" at ", " "));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function splitLines(value?: string | string[]): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  return String(value || "").split("\n").map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}

export function parseCarePartners(value?: string | RecoveryCarePartner[]): RecoveryCarePartner[] {
  if (Array.isArray(value)) {
    return value.filter((p) => p?.name?.trim()).map((p) => ({
      name: p.name.trim(),
      role: p.role?.trim() || "",
      can_share: p.can_share?.trim() || "",
      contact: p.contact?.trim() || "",
    }));
  }
  return splitLines(value).map((line) => {
    const [name, role = "", canShare = "", contact = ""] = line.split("|").map((part) => part.trim());
    return { name, role, can_share: canShare, contact };
  }).filter((p) => p.name);
}

export function normalizeRecoveryProfile(input: RecoveryProfileInput): RecoveryProfile {
  return {
    survivor_name: input.survivor_name?.trim() || "",
    setup_by: input.setup_by || "self",
    support_mode: input.support_mode || "independent",
    injury_context: input.injury_context?.trim() || "",
    current_stage: input.current_stage?.trim() || "",
    affected_areas: splitLines(input.affectedAreas || input.affected_areas),
    strengths: splitLines(input.strengths),
    harder_things: splitLines(input.harderThings || input.harder_things),
    overload_triggers: splitLines(input.overloadTriggers || input.overload_triggers),
    helpful_supports: splitLines(input.helpfulSupports || input.helpful_supports),
    communication_preferences: splitLines(input.communicationPreferences || input.communication_preferences),
    care_partners: parseCarePartners(input.carePartners || input.care_partners),
    never_share: splitLines(input.neverShare || input.never_share),
    appointment_priorities: splitLines(input.appointmentPriorities || input.appointment_priorities),
  };
}

export function recoveryProfileContent(profile: RecoveryProfile): string {
  return [
    "Recovery profile",
    profile.survivor_name ? `Name: ${profile.survivor_name}` : "",
    profile.injury_context ? `Context: ${profile.injury_context}` : "",
    profile.affected_areas?.length ? `Affected areas: ${profile.affected_areas.join(", ")}` : "",
    profile.harder_things?.length ? `Harder things: ${profile.harder_things.join(", ")}` : "",
    profile.helpful_supports?.length ? `Helpful supports: ${profile.helpful_supports.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

export function isValidRecoveryProfile(profile: RecoveryProfile): boolean {
  return Boolean(profile.injury_context || profile.affected_areas?.length || profile.harder_things?.length);
}

export function titleOf(item: RecoveryItem): string {
  return String(item.metadata?.title || item.metadata?.summary || item.metadata?.question || item.content.split("\n")[0]).slice(0, 120);
}

export function textOf(item: RecoveryItem, max = 180): string {
  return item.content.replace(/\s+/g, " ").slice(0, max);
}

export function dayStart(d = new Date()): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function dayEnd(d = new Date()): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function daysSince(value: string | null, now = new Date()): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

export function recoverySignals(rows: RecoveryItem[]) {
  const symptoms = rows.filter((r) => /fatigue|tired|headache|dizzy|overwhelm|symptom|brain fog|aphasia|word|sleep|nap|pain/i.test(r.content)).slice(0, 8);
  const wins = rows.filter((r) => /win|better|progress|proud|grateful|joy|walk|exercise|therapy|practice|remembered|calm/i.test(r.content)).slice(0, 8);
  const hardThings = rows.filter((r) => /hard|difficult|frustrat|forgot|missed|confus|overload|too much|setback/i.test(r.content)).slice(0, 8);
  return {
    symptoms: symptoms.map((r) => ({ id: r.id, title: titleOf(r), text: textOf(r), source: r.source, created_at: r.created_at })),
    wins: wins.map((r) => ({ id: r.id, title: titleOf(r), text: textOf(r), source: r.source, created_at: r.created_at })),
    hardThings: hardThings.map((r) => ({ id: r.id, title: titleOf(r), text: textOf(r), source: r.source, created_at: r.created_at })),
  };
}

export function energyPlan(openTodos: RecoveryItem[], todayEvents: RecoveryItem[], recentRows: RecoveryItem[]) {
  const eventCount = todayEvents.length;
  const todoCount = openTodos.length;
  const overloadWords = recentRows.filter((r) => /fatigue|overwhelm|tired|brain fog|headache|hard|too much/i.test(r.content)).length;
  const load = eventCount * 12 + Math.min(40, todoCount * 2) + Math.min(30, overloadWords * 4);
  const energy = Math.max(0, Math.min(100, 100 - load));
  const supports: string[] = [];
  if (eventCount > 2) supports.push("Keep transition time between appointments and protect one quiet block.");
  if (todoCount > 8) supports.push("Choose only one must-do and one nice-to-do.");
  if (overloadWords > 2) supports.push("Treat fatigue as data. Reduce input before pushing output.");
  if (supports.length === 0) supports.push("Keep the day simple and notice what gives energy back.");
  return { score: energy, load, supports };
}

export function buildRecoveryDailyView(input: RecoveryDailyInput): RecoveryDailyView {
  const now = input.now || new Date();
  const start = dayStart(now);
  const end = dayEnd(now);
  const profile = input.profileRecord?.profile || {};
  const eventsToday = input.events.filter((event) => {
    const eventStart = parseDate(event.metadata?.start);
    return eventStart && eventStart >= start && eventStart <= end;
  });
  const highPriorityTodos = input.openTodos.filter((todo) => todo.metadata?.priority === "high").slice(0, 4);
  const essentials = [...highPriorityTodos, ...input.openTodos.filter((todo) => todo.metadata?.priority !== "low").slice(0, 5)]
    .filter((item, idx, arr) => arr.findIndex((other) => other.id === item.id) === idx)
    .slice(0, 5);
  const signals = recoverySignals(input.recentItems);
  const energy = energyPlan(input.openTodos, eventsToday, input.recentItems.slice(0, 80));
  const profileCarePeople = (profile.care_partners || []).map((p, idx) => ({
    id: `profile-care-${idx}`,
    name: p.name,
    relationship: p.role || "care partner",
    daysSince: null,
    context: { can_share: p.can_share || "" },
    contact: p.contact || null,
    source: "profile",
  }));
  const inferredCarePeople = input.people
    .filter((p) => /wife|partner|family|brother|sister|mom|dad|friend|care|therapist|doctor|physician|coach/i.test(`${p.relationship || ""} ${JSON.stringify(p.context || {})}`))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      daysSince: daysSince(p.last_interaction, now),
      context: p.context || {},
      contact: p.contact,
      source: "people",
    }));
  const carePeople = [...profileCarePeople, ...inferredCarePeople]
    .filter((person, idx, arr) => arr.findIndex((other) => other.name.toLowerCase() === person.name.toLowerCase()) === idx)
    .slice(0, 12);
  const shareable = [
    profile.survivor_name ? `For ${profile.survivor_name}:` : "",
    energy.score < 45 ? "Energy looks low. A lighter day and fewer context switches may help." : "Energy load looks manageable if the day stays simple.",
    signals.wins[0] ? `Recent win: ${signals.wins[0].text}` : "No recent win captured yet.",
    signals.hardThings[0] ? `Recent hard thing: ${signals.hardThings[0].text}` : "No recent hard thing captured yet.",
    essentials[0] ? `Most important next action: ${textOf(essentials[0], 140)}` : "No urgent next action found.",
    (profile.helpful_supports || [])[0] ? `Helpful support: ${profile.helpful_supports?.[0]}` : "",
  ].filter(Boolean);

  return {
    profile: input.profileRecord ? { id: input.profileRecord.id, created_at: input.profileRecord.created_at, ...profile } : null,
    onboarding: {
      completed: Boolean(input.profileRecord),
      mode: profile.support_mode || "independent",
      setupBy: profile.setup_by || "self",
      nextPrompt: input.profileRecord ? "Review profile after major changes or appointments." : "Create a recovery profile so support can match the person, not a generic survivor.",
    },
    today: {
      date: start.toISOString().slice(0, 10),
      energy,
      events: eventsToday.slice(0, 8).map((event) => ({
        id: event.id,
        title: titleOf(event),
        start: typeof event.metadata?.start === "string" ? event.metadata.start : undefined,
        end: typeof event.metadata?.end === "string" ? event.metadata.end : undefined,
        location: typeof event.metadata?.location === "string" ? event.metadata.location : "",
      })),
      essentials: essentials.map((todo) => ({
        id: todo.id,
        title: titleOf(todo),
        text: textOf(todo, 220),
        priority: typeof todo.metadata?.priority === "string" ? todo.metadata.priority : "normal",
        source: todo.source,
      })),
    },
    checkInPrompts: [
      "How is your energy right now?",
      "What feels harder than usual?",
      "What helped today, even a little?",
      "Is there anything someone else should know?",
    ],
    memory: {
      carePeople,
      recentWins: signals.wins,
      recentHardThings: signals.hardThings,
      symptoms: signals.symptoms,
    },
    careCircle: {
      enabledByDefault: false,
      note: "Share only after review. Nothing is sent automatically.",
      draft: shareable.join("\n"),
    },
    recoveryPrinciples: [
      "One must-do is enough for a hard day.",
      "Fatigue is information, not failure.",
      "Memory aids are a strength, not a crutch.",
      "The goal is a humane loop: notice, support, recover, learn.",
    ],
  };
}

function clampWindowDays(value?: number): number {
  if (!Number.isFinite(Number(value))) return 14;
  return Math.max(7, Math.min(60, Math.round(Number(value))));
}

function stringField(item: RecoveryItem, key: string): string {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberField(item: RecoveryItem, key: string): number | null {
  const value = Number(item.metadata?.[key]);
  return Number.isFinite(value) ? value : null;
}

function simpleTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["and", "the", "for", "with", "that", "this", "was", "were", "from", "need", "needed"].includes(word))
    .slice(0, 5)
    .join(" ")
    .trim();
}

function countPhrases(values: string[], fallbacks: string[] = []): RecoveryPatternBucket[] {
  const counts = new Map<string, { count: number; evidence: string[] }>();
  for (const raw of values) {
    const phrases = splitLines(raw).length ? splitLines(raw) : raw.split(/[.;]/).map((part) => part.trim()).filter(Boolean);
    for (const phrase of phrases) {
      const key = simpleTitle(phrase);
      if (!key) continue;
      const existing = counts.get(key) || { count: 0, evidence: [] };
      existing.count += 1;
      if (existing.evidence.length < 3) existing.evidence.push(phrase.slice(0, 160));
      counts.set(key, existing);
    }
  }
  for (const fallback of fallbacks) {
    const key = simpleTitle(fallback);
    if (!key || counts.has(key)) continue;
    counts.set(key, { count: 1, evidence: [fallback] });
  }
  return [...counts.entries()]
    .map(([title, value]) => ({ title, count: value.count, evidence: value.evidence }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 5);
}

function eventsByDay(events: RecoveryItem[]): Map<string, RecoveryItem[]> {
  const grouped = new Map<string, RecoveryItem[]>();
  for (const event of events) {
    const start = parseDate(event.metadata?.start) || parseDate(event.created_at);
    if (!start) continue;
    const key = start.toISOString().slice(0, 10);
    const day = grouped.get(key) || [];
    day.push(event);
    grouped.set(key, day);
  }
  return grouped;
}

function patternLine(bucket: RecoveryPatternBucket[] | undefined, empty: string): string {
  const first = bucket?.[0];
  return first ? `${first.title} (${first.count})` : empty;
}

export function buildPatternReview(input: RecoveryPatternReviewInput): RecoveryPatternReview {
  const now = input.now || new Date();
  const days = clampWindowDays(input.windowDays);
  const start = dayStart(new Date(now.getTime() - (days - 1) * 86_400_000));
  const end = dayEnd(now);
  const profile = input.profileRecord?.profile || {};
  const checkIns = input.checkIns.filter((item) => {
    const created = parseDate(item.created_at);
    return created && created >= start && created <= end;
  });
  const energies = checkIns.map((item) => numberField(item, "energy")).filter((value): value is number => value != null);
  const averageEnergy = energies.length ? Math.round((energies.reduce((sum, value) => sum + value, 0) / energies.length) * 10) / 10 : null;
  const lowDays = energies.filter((value) => value <= 4).length;
  const symptoms = checkIns.map((item) => stringField(item, "symptoms")).filter(Boolean);
  const hardThings = checkIns.map((item) => stringField(item, "hard_thing")).filter(Boolean);
  const wins = checkIns.map((item) => stringField(item, "win")).filter(Boolean);
  const supports = checkIns.map((item) => stringField(item, "support_needed")).filter(Boolean);
  const calendarDays = eventsByDay(input.events);
  const busyDays = [...calendarDays.entries()]
    .filter(([, events]) => events.length >= 3)
    .map(([date, events]) => `${date}: ${events.length} calendar items`);
  const openTodoPressure = input.openTodos.length >= 8 ? [`${input.openTodos.length} open todos are visible`] : [];
  const overload = countPhrases([...symptoms, ...hardThings], [...(profile.overload_triggers || []), ...busyDays, ...openTodoPressure]);
  const patterns = {
    overload,
    supports: countPhrases(supports, profile.helpful_supports || []),
    hardThings: countPhrases(hardThings, profile.harder_things || []),
    wins: countPhrases(wins, profile.strengths || []),
  };
  const suggestedAdjustments: string[] = [];
  if (averageEnergy == null) suggestedAdjustments.push("Capture three low-friction check-ins this week so the system can learn what changed.");
  if (averageEnergy != null && averageEnergy <= 4.5) suggestedAdjustments.push("Plan fewer transitions and make one recovery block non-negotiable on low-energy days.");
  if (lowDays >= 2) suggestedAdjustments.push("Treat repeated low-energy days as a planning constraint, not a motivation problem.");
  if (supports.length >= 2 || patterns.supports.length) suggestedAdjustments.push("Turn the most repeated support need into a concrete ask for the care circle.");
  if (busyDays.length) suggestedAdjustments.push("Protect buffer time around days with three or more calendar items.");
  if ((profile.communication_preferences || []).length) suggestedAdjustments.push(`Use the stated communication preference: ${profile.communication_preferences?.[0]}.`);
  if (suggestedAdjustments.length === 0) suggestedAdjustments.push("Keep the loop simple: one must-do, one check-in, one small recovery-supporting choice.");
  const appointmentPrep = [
    ...(profile.appointment_priorities || []).slice(0, 4),
    patterns.hardThings[0] ? `Ask about repeated hard thing: ${patterns.hardThings[0].title}.` : "",
    patterns.overload[0] ? `Bring up overload pattern: ${patterns.overload[0].title}.` : "",
  ].filter(Boolean);
  const careCircleDraft = [
    profile.survivor_name ? `For ${profile.survivor_name}:` : "This week looked like:",
    `Energy: ${averageEnergy == null ? "not enough check-ins yet" : `${averageEnergy}/10 average`} (${lowDays} low-energy day${lowDays === 1 ? "" : "s"}).`,
    `Hard thing: ${patternLine(patterns.hardThings, "not clearly repeated yet")}.`,
    `What helped or is needed: ${patternLine(patterns.supports, "not clearly captured yet")}.`,
    `Win to keep: ${patternLine(patterns.wins, "no win captured yet")}.`,
    `Next adjustment: ${suggestedAdjustments[0]}`,
  ].join("\n");
  const reviewMarkdown = [
    frontmatter({ type: "weekly_recovery_review", exported_at: now.toISOString(), window_days: days }),
    "# Weekly Review",
    "",
    `Window: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    "",
    "## Energy",
    "",
    `Average: ${averageEnergy == null ? "Not enough data" : `${averageEnergy}/10`}`,
    `Low-energy days: ${lowDays}`,
    `Check-ins: ${energies.length}`,
    "",
    "## Overload Patterns",
    "",
    mdList(patterns.overload.map((item) => `${item.title} (${item.count})`)),
    "",
    "## Supports",
    "",
    mdList(patterns.supports.map((item) => `${item.title} (${item.count})`)),
    "",
    "## Wins",
    "",
    mdList(patterns.wins.map((item) => `${item.title} (${item.count})`)),
    "",
    "## Suggested Adjustments",
    "",
    mdList(suggestedAdjustments),
    "",
    "## Care-Circle Draft",
    "",
    careCircleDraft,
  ].join("\n");

  return {
    window: { days, start: start.toISOString(), end: end.toISOString() },
    energy: { average: averageEnergy, lowDays, entries: energies.length },
    patterns,
    suggestedAdjustments,
    careCircleDraft,
    appointmentPrep,
    reviewMarkdown,
  };
}

function mdList(items?: string[]): string {
  const clean = (items || []).map((item) => item.trim()).filter(Boolean);
  return clean.length ? clean.map((item) => `- ${item}`).join("\n") : "- Not captured yet.";
}

function mdValue(value?: string | null): string {
  return value?.trim() || "Not captured yet.";
}

function frontmatter(values: Record<string, string | number | boolean | null | undefined>): string {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value ?? "")}`);
  return ["---", ...lines, "---", ""].join("\n");
}

export function buildRecoveryVaultExport(input: RecoveryVaultInput): RecoveryVaultExport {
  const exportedAt = input.exportedAt || new Date();
  const profileRecord = input.profileRecord;
  const profile = profileRecord?.profile || {};
  const profileMarkdown = [
    frontmatter({ type: "recovery_profile", exported_at: exportedAt.toISOString(), source_id: profileRecord?.id || null }),
    "# Recovery Profile",
    "",
    `Name: ${mdValue(profile.survivor_name)}`,
    `Setup by: ${mdValue(profile.setup_by)}`,
    `Support mode: ${mdValue(profile.support_mode)}`,
    "",
    "## Injury Context",
    "",
    mdValue(profile.injury_context),
    "",
    "## Current Stage",
    "",
    mdValue(profile.current_stage),
    "",
    "## Affected Areas",
    "",
    mdList(profile.affected_areas),
    "",
    "## Things That Are Harder Now",
    "",
    mdList(profile.harder_things),
    "",
    "## Strengths To Preserve",
    "",
    mdList(profile.strengths),
    "",
    "## Communication Preferences",
    "",
    mdList(profile.communication_preferences),
  ].join("\n");
  const wins = input.checkIns.map((row) => String(row.metadata?.win || "")).filter(Boolean).slice(0, 12);
  const whatHelpsMarkdown = [
    frontmatter({ type: "what_helps", exported_at: exportedAt.toISOString() }),
    "# What Helps",
    "",
    "## Helpful Supports",
    "",
    mdList(profile.helpful_supports),
    "",
    "## Overload Triggers",
    "",
    mdList(profile.overload_triggers),
    "",
    "## Recent Wins",
    "",
    mdList(wins),
  ].join("\n");
  const partners = profile.care_partners || [];
  const careCircleMarkdown = [
    frontmatter({ type: "care_circle", exported_at: exportedAt.toISOString() }),
    "# Care Circle",
    "",
    "## People",
    "",
    partners.length ? partners.map((p) => `- ${p.name}${p.role ? ` (${p.role})` : ""}${p.can_share ? ` - can share: ${p.can_share}` : ""}${p.contact ? ` - contact: ${p.contact}` : ""}`).join("\n") : "- Not captured yet.",
    "",
    "## Never Share Without Explicit Permission",
    "",
    mdList(profile.never_share),
    "",
    "## Recent Drafts",
    "",
    input.careBriefs.length ? input.careBriefs.slice(0, 8).map((brief) => `### ${new Date(brief.created_at).toLocaleDateString()}\n\n${brief.content}`).join("\n\n") : "No care-circle drafts saved yet.",
  ].join("\n");
  const checkInsMarkdown = [
    frontmatter({ type: "recovery_check_ins", exported_at: exportedAt.toISOString(), count: input.checkIns.length }),
    "# Recovery Check-Ins",
    "",
    input.checkIns.length ? input.checkIns.map((row) => {
      const date = new Date(row.created_at).toISOString().slice(0, 10);
      return [`## ${date}`, "", row.content].join("\n");
    }).join("\n\n") : "No check-ins captured yet.",
  ].join("\n");
  const appointmentPrepMarkdown = [
    frontmatter({ type: "appointment_prep", exported_at: exportedAt.toISOString() }),
    "# Appointment Prep",
    "",
    "## Default Priorities",
    "",
    mdList(profile.appointment_priorities),
    "",
    "## Upcoming / Recent Appointments",
    "",
    input.events.length ? input.events.slice(0, 12).map((event) => {
      const start = parseDate(event.metadata?.start);
      return `- ${start ? start.toISOString().slice(0, 10) : "unknown date"}: ${titleOf(event)}`;
    }).join("\n") : "- No appointments found.",
  ].join("\n");
  const readme = [
    frontmatter({ type: "recovery_vault_readme", exported_at: exportedAt.toISOString() }),
    "# Continuity Vault",
    "",
    "This folder is a plain Markdown export of Recovery context.",
    "",
    "It is designed for portability into Obsidian, local folders, caregiver review, clinician visit prep, or any future AI assistant that can read Markdown.",
    "",
    "Nothing in this vault is sent automatically. Review before sharing.",
  ].join("\n");
  const weeklyReviewFile = input.patternReview
    ? [{ path: "Recovery/Weekly Reviews/Latest.md", content: input.patternReview.reviewMarkdown }]
    : [];

  return {
    exportedAt: exportedAt.toISOString(),
    format: "markdown-vault",
    files: [
      { path: "Recovery/Profile.md", content: profileMarkdown },
      { path: "Recovery/What Helps.md", content: whatHelpsMarkdown },
      { path: "Recovery/Care Circle.md", content: careCircleMarkdown },
      { path: "Recovery/Check-Ins.md", content: checkInsMarkdown },
      { path: "Recovery/Appointment Prep.md", content: appointmentPrepMarkdown },
      ...weeklyReviewFile,
      { path: "Recovery/README.md", content: readme },
    ],
  };
}
