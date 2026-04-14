/**
 * Industry association board/member scrapers.
 *
 * Scrapes publicly available leadership directories from major manufacturing
 * and industrial associations: NAM, SME, AME, ISA, MESA, CSIA, MAPI.
 */

import type { DiscoveredPerson } from "./index.js";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml",
};

interface AssociationSource {
  name: string;
  url: string;
  source: string;
}

const SOURCES: AssociationSource[] = [
  { name: "NAM", url: "https://www.nam.org/about/board-of-directors/", source: "nam_board" },
  { name: "SME", url: "https://www.sme.org/about/board-of-directors/", source: "sme_board" },
  { name: "AME", url: "https://www.ame.org/about-ame/board-of-directors", source: "ame_board" },
  { name: "ISA", url: "https://www.isa.org/about-isa/leadership", source: "isa_leadership" },
  { name: "MESA International", url: "https://www.mesa.org/about-mesa/board-of-directors", source: "mesa_board" },
  { name: "CSIA", url: "https://www.controlsys.org/members/member-directory", source: "csia_members" },
  { name: "MAPI", url: "https://www.mapi.net/about/leadership", source: "mapi_leadership" },
  { name: "ARC Advisory Group", url: "https://www.arcweb.com/about-us/leadership", source: "arc_leadership" },
  { name: "CESMII", url: "https://www.cesmii.org/about/leadership/", source: "cesmii_leadership" },
  { name: "MxD", url: "https://www.mxdusa.org/about/leadership/", source: "mxd_leadership" },
];

function extractPeople(html: string, sourceUrl: string, orgName: string, sourceKey: string): DiscoveredPerson[] {
  const people: DiscoveredPerson[] = [];
  const seen = new Set<string>();

  // Pattern 1: <strong>Name</strong> followed by title
  const strongPattern = /<(?:strong|b|h[2-6])[^>]*>([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)<\/(?:strong|b|h[2-6])>[\s,\-–]*([^<]{5,80})/g;
  for (const match of html.matchAll(strongPattern)) {
    addPerson(match[1], match[2], people, seen, orgName, sourceKey, sourceUrl);
  }

  // Pattern 2: JSON-LD structured data
  const ldPattern = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
  for (const match of html.matchAll(ldPattern)) {
    try {
      const ld = JSON.parse(match[1]);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item["@type"] === "Person" && item.name?.includes(" ")) {
          addPerson(item.name, item.jobTitle || item.description || "", people, seen, orgName, sourceKey, sourceUrl);
        }
        // Check member/employee arrays
        for (const key of ["member", "employee", "founder", "alumni"]) {
          const arr = Array.isArray(item[key]) ? item[key] : item[key] ? [item[key]] : [];
          for (const p of arr) {
            if (p?.name?.includes(" ")) {
              addPerson(p.name, p.jobTitle || key, people, seen, orgName, sourceKey, sourceUrl);
            }
          }
        }
      }
    } catch { /* bad JSON-LD */ }
  }

  // Pattern 3: "Name, Title at Company" in plain text
  const nameRolePattern = /([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z][^,\n<]{5,60})/g;
  for (const match of html.matchAll(nameRolePattern)) {
    const name = match[1].trim();
    const role = match[2].replace(/<[^>]+>/g, "").trim();
    // Only add if role looks like a job title (contains common title words)
    if (/CEO|President|VP|Director|Manager|Chief|Officer|Chair|Founder|Partner/i.test(role)) {
      addPerson(name, role, people, seen, orgName, sourceKey, sourceUrl);
    }
  }

  return people;
}

function addPerson(
  name: string, role: string, people: DiscoveredPerson[], seen: Set<string>,
  orgName: string, sourceKey: string, sourceUrl: string
) {
  const clean = name.replace(/<[^>]+>/g, "").trim();
  if (clean.length < 4 || !clean.includes(" ") || seen.has(clean.toLowerCase())) return;
  seen.add(clean.toLowerCase());
  const parts = clean.split(/\s+/);
  people.push({
    name: clean,
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    role: role.replace(/<[^>]+>/g, "").trim().slice(0, 100),
    company: orgName,
    source: sourceKey,
    sourceUrl,
    discoveredAt: new Date().toISOString(),
    metadata: { association: orgName },
  });
}

async function scrapeSingle(src: AssociationSource): Promise<DiscoveredPerson[]> {
  try {
    const r = await fetch(src.url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const html = await r.text();
    return extractPeople(html, src.url, src.name, src.source);
  } catch {
    return [];
  }
}

export async function discoverFromAssociations(): Promise<DiscoveredPerson[]> {
  const results: DiscoveredPerson[] = [];

  // Run sequentially with 1s delay to be polite
  for (const src of SOURCES) {
    const people = await scrapeSingle(src);
    console.log(`    ${src.name}: ${people.length} people`);
    results.push(...people);
    await new Promise(r => setTimeout(r, 1000));
  }

  return results;
}
