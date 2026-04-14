/**
 * State manufacturing directory scrapers.
 *
 * State MEPs and economic development agencies publish manufacturer
 * registries. These are publicly funded — data is freely available.
 *
 * Sources: Ohio MEP (MAGNET), ThomasNet, IndustryNet, state MEP networks
 */

import type { DiscoveredPerson } from "./index.js";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml",
};

interface DirectorySource {
  name: string;
  urls: string[];
  source: string;
}

const SOURCES: DirectorySource[] = [
  {
    name: "Ohio MEP (MAGNET)",
    urls: [
      "https://www.manufacturingsuccess.org/case-studies",
      "https://www.manufacturingsuccess.org/our-clients",
    ],
    source: "ohio_mep",
  },
  {
    name: "Michigan MEP (MMTC)",
    urls: ["https://www.the-center.org/Success-Stories"],
    source: "michigan_mep",
  },
  {
    name: "Indiana MEP (Conexus)",
    urls: ["https://www.conexusindiana.com/about/leadership/"],
    source: "indiana_mep",
  },
  {
    name: "NIST MEP Centers",
    urls: ["https://www.nist.gov/mep/centers"],
    source: "nist_mep",
  },
];

function extractFromHTML(html: string, sourceUrl: string, dirName: string, sourceKey: string): DiscoveredPerson[] {
  const people: DiscoveredPerson[] = [];
  const seen = new Set<string>();

  // Pattern: "CEO/President/Owner Name of Company"
  const roleNamePattern = /(?:CEO|President|Owner|VP|Director|Manager|Founder|Partner|General Manager|Plant Manager)\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:of|at|from)\s+([A-Z][^\.,<]{3,50})/g;
  for (const match of html.matchAll(roleNamePattern)) {
    const name = match[1].trim();
    const company = match[2].replace(/<[^>]+>/g, "").trim();
    const role = match[0].split(name)[0].trim().replace(/[,\-–\s]+$/, "");
    if (name.length > 4 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      const parts = name.split(/\s+/);
      people.push({
        name,
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
        role,
        company,
        source: sourceKey,
        sourceUrl,
        discoveredAt: new Date().toISOString(),
        metadata: { directory: dirName },
      });
    }
  }

  // Pattern: "Name, Title" in structured lists
  const nameRolePattern = /<(?:strong|b|h[2-6])[^>]*>([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)<\/(?:strong|b|h[2-6])>[\s,\-–]*([^<]{5,80})/g;
  for (const match of html.matchAll(nameRolePattern)) {
    const name = match[1].trim();
    const role = match[2].replace(/<[^>]+>/g, "").trim();
    if (name.length > 4 && !seen.has(name.toLowerCase()) && /CEO|President|VP|Director|Manager|Chief|Officer|Founder/i.test(role)) {
      seen.add(name.toLowerCase());
      const parts = name.split(/\s+/);
      people.push({
        name,
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
        role: role.slice(0, 100),
        company: dirName,
        source: sourceKey,
        sourceUrl,
        discoveredAt: new Date().toISOString(),
        metadata: { directory: dirName },
      });
    }
  }

  // JSON-LD
  const ldPattern = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
  for (const match of html.matchAll(ldPattern)) {
    try {
      const ld = JSON.parse(match[1]);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item["@type"] === "Person" && item.name?.includes(" ") && !seen.has(item.name.toLowerCase())) {
          seen.add(item.name.toLowerCase());
          const parts = item.name.split(/\s+/);
          people.push({
            name: item.name,
            firstName: parts[0],
            lastName: parts.slice(1).join(" "),
            role: item.jobTitle || "",
            company: typeof item.worksFor === "object" ? item.worksFor?.name || "" : item.worksFor || "",
            source: sourceKey,
            sourceUrl,
            discoveredAt: new Date().toISOString(),
            metadata: { directory: dirName },
          });
        }
      }
    } catch { /* skip */ }
  }

  return people;
}

export async function discoverFromDirectories(): Promise<DiscoveredPerson[]> {
  const results: DiscoveredPerson[] = [];

  for (const src of SOURCES) {
    let total = 0;
    for (const url of src.urls) {
      try {
        const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        const html = await r.text();
        const people = extractFromHTML(html, url, src.name, src.source);
        results.push(...people);
        total += people.length;
      } catch { /* network error */ }
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log(`    ${src.name}: ${total} people`);
  }

  return results;
}
