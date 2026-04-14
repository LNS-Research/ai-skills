/**
 * @lns-skills/people-discovery
 *
 * Multi-source people discovery service. Finds ops/manufacturing leaders
 * across public sources beyond LinkedIn:
 *
 *   - Facebook company pages (leadership sections)
 *   - Industry associations (NAM, SME, AME, ISA, MESA, CSIA, MAPI)
 *   - State manufacturing directories (MEPs, ThomasNet)
 *   - Trade show speaker lists (IMTS, Automate, FABTECH, Hannover)
 *   - Apify fallback (LinkedIn enrichment when free sources fail)
 *
 * Each source returns a standardized DiscoveredPerson[] that any consumer
 * (People service, OpenBrain, CDI) can ingest.
 */

export interface DiscoveredPerson {
  name: string;
  firstName?: string;
  lastName?: string;
  role: string;
  company: string;
  ticker?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  source: string;        // e.g. "facebook_page", "nam_board", "imts_speaker"
  sourceUrl: string;
  discoveredAt: string;  // ISO date
  metadata?: Record<string, unknown>;
}

export { discoverFromFacebook } from "./facebook.js";
export { discoverFromAssociations } from "./associations.js";
export { discoverFromDirectories } from "./directories.js";
export { discoverFromTradeShows } from "./tradeshows.js";
export { discoverFromApify } from "./apify.js";

/**
 * Run all discovery sources for a company. Returns deduplicated results.
 */
export async function discoverAll(
  companyName: string,
  opts: { ticker?: string; includeApify?: boolean; apifyToken?: string } = {}
): Promise<DiscoveredPerson[]> {
  const { discoverFromFacebook } = await import("./facebook.js");
  const { discoverFromAssociations } = await import("./associations.js");
  const { discoverFromDirectories } = await import("./directories.js");
  const { discoverFromTradeShows } = await import("./tradeshows.js");

  const results: DiscoveredPerson[] = [];

  // Run free sources in parallel
  const [fb, assoc, dirs, shows] = await Promise.allSettled([
    discoverFromFacebook(companyName, opts.ticker),
    discoverFromAssociations(),
    discoverFromDirectories(),
    discoverFromTradeShows(),
  ]);

  for (const r of [fb, assoc, dirs, shows]) {
    if (r.status === "fulfilled") results.push(...r.value);
  }

  // Apify fallback (only if requested and token provided)
  if (opts.includeApify && opts.apifyToken) {
    const { discoverFromApify } = await import("./apify.js");
    const apifyResults = await discoverFromApify(companyName, opts.apifyToken, opts.ticker);
    results.push(...apifyResults);
  }

  // Deduplicate by normalized name
  const seen = new Set<string>();
  return results.filter(p => {
    const key = p.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
