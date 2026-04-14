/**
 * Apify fallback — LinkedIn enrichment when free sources fail.
 *
 * Uses Apify actors (no-cookie LinkedIn scrapers) to:
 *   1. Get company employees from LinkedIn company pages
 *   2. Enrich individual profiles with full work history
 *
 * Only used when explicitly requested (includeApify=true).
 * Requires APIFY_TOKEN env var or passed token.
 */

import type { DiscoveredPerson } from "./index.js";

const APIFY_API = "https://api.apify.com/v2";

// Best no-cookie LinkedIn actors (community-maintained)
const ACTORS = {
  companyEmployees: "harvestapi/linkedin-company-employees",
  profileScraper: "supreme_coder/linkedin-profile-scraper",
  companyDetails: "harvestapi/linkedin-company",
};

interface ApifyRunResult {
  items: Record<string, unknown>[];
}

async function runActor(actorId: string, input: Record<string, unknown>, token: string): Promise<ApifyRunResult> {
  const url = `${APIFY_API}/acts/${actorId}/runs?token=${token}&waitForFinish=120`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!r.ok) {
    throw new Error(`Apify actor ${actorId} failed: ${r.status} ${await r.text()}`);
  }

  const run = await r.json() as { data: { defaultDatasetId: string } };
  const datasetId = run.data.defaultDatasetId;

  // Fetch results from dataset
  const dataR = await fetch(`${APIFY_API}/datasets/${datasetId}/items?token=${token}&limit=1000`);
  if (!dataR.ok) {
    throw new Error(`Failed to fetch dataset ${datasetId}: ${dataR.status}`);
  }

  const items = await dataR.json() as Record<string, unknown>[];
  return { items };
}

/**
 * Get employees for a company from LinkedIn via Apify.
 */
export async function getCompanyEmployees(
  companyLinkedInUrl: string,
  token: string,
  ticker?: string,
): Promise<DiscoveredPerson[]> {
  const result = await runActor(ACTORS.companyEmployees, {
    companyUrls: [companyLinkedInUrl],
    count: 100,
  }, token);

  return result.items.map(item => {
    const name = `${item.firstName || ""} ${item.lastName || ""}`.trim();
    return {
      name,
      firstName: (item.firstName as string) || undefined,
      lastName: (item.lastName as string) || undefined,
      role: (item.title as string) || (item.headline as string) || "",
      company: (item.companyName as string) || "",
      ticker,
      linkedinUrl: (item.profileUrl as string) || (item.url as string) || undefined,
      source: "apify_linkedin_employees",
      sourceUrl: companyLinkedInUrl,
      discoveredAt: new Date().toISOString(),
      metadata: {
        location: item.location,
        connectionDegree: item.connectionDegree,
      },
    };
  });
}

/**
 * Enrich a profile URL with full work history.
 */
export async function enrichProfile(
  profileUrl: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const result = await runActor(ACTORS.profileScraper, {
    profileUrls: [profileUrl],
  }, token);

  return result.items[0] || null;
}

/**
 * Main entry: discover people at a company via Apify LinkedIn scraping.
 */
export async function discoverFromApify(
  companyName: string,
  token: string,
  ticker?: string,
): Promise<DiscoveredPerson[]> {
  if (!token) return [];

  // First, find the company's LinkedIn URL
  try {
    const result = await runActor(ACTORS.companyDetails, {
      queries: [companyName],
      count: 1,
    }, token);

    if (!result.items.length) return [];

    const companyUrl = (result.items[0].url as string) || (result.items[0].linkedInUrl as string);
    if (!companyUrl) return [];

    // Then get employees
    return getCompanyEmployees(companyUrl, token, ticker);
  } catch (e) {
    console.error(`  [apify] Error discovering ${companyName}: ${e}`);
    return [];
  }
}
