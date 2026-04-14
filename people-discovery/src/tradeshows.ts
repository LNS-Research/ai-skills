/**
 * Trade show speaker/exhibitor list scrapers.
 *
 * Major industrial trade shows publish speaker bios and exhibitor
 * company contacts. These identify senior ops leaders who present
 * at industry events.
 */

import type { DiscoveredPerson } from "./index.js";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml",
};

interface ShowSource {
  name: string;
  urls: string[];
  source: string;
}

const SOURCES: ShowSource[] = [
  {
    name: "IMTS (Intl Manufacturing Technology Show)",
    urls: [
      "https://www.imts.com/show/speakers.cfm",
      "https://www.imts.com/conference/speakers.cfm",
    ],
    source: "imts_speaker",
  },
  {
    name: "Automate (A3 Robotics Show)",
    urls: [
      "https://www.automateshow.com/speakers",
      "https://www.automate.org/events",
    ],
    source: "automate_speaker",
  },
  {
    name: "FABTECH",
    urls: [
      "https://www.fabtechexpo.com/conference/speakers",
    ],
    source: "fabtech_speaker",
  },
  {
    name: "Hannover Messe USA",
    urls: [
      "https://www.hannovermesse.de/en/conference/speakers/",
    ],
    source: "hannover_speaker",
  },
  {
    name: "Rockwell Automation Fair",
    urls: [
      "https://www.rockwellautomation.com/en-us/company/events/automation-fair.html",
    ],
    source: "ra_fair_speaker",
  },
  {
    name: "ARC Industry Leadership Forum",
    urls: [
      "https://www.arcweb.com/events/arc-industry-leadership-forum",
    ],
    source: "arc_forum_speaker",
  },
  {
    name: "Manufacturing & Technology Conference (MAPI)",
    urls: [
      "https://www.mapi.net/events",
    ],
    source: "mapi_conference_speaker",
  },
];

function extractSpeakers(html: string, sourceUrl: string, showName: string, sourceKey: string): DiscoveredPerson[] {
  const people: DiscoveredPerson[] = [];
  const seen = new Set<string>();

  // Pattern 1: JSON-LD Speaker data
  const ldPattern = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
  for (const match of html.matchAll(ldPattern)) {
    try {
      const ld = JSON.parse(match[1]);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        // Event schema with performer/speaker
        for (const key of ["performer", "speaker", "organizer", "contributor"]) {
          const arr = Array.isArray(item[key]) ? item[key] : item[key] ? [item[key]] : [];
          for (const p of arr) {
            if (p?.name?.includes(" ") && !seen.has(p.name.toLowerCase())) {
              seen.add(p.name.toLowerCase());
              const parts = p.name.split(/\s+/);
              people.push({
                name: p.name,
                firstName: parts[0],
                lastName: parts.slice(1).join(" "),
                role: p.jobTitle || "Speaker",
                company: typeof p.worksFor === "object" ? p.worksFor?.name || "" : p.worksFor || "",
                source: sourceKey,
                sourceUrl,
                discoveredAt: new Date().toISOString(),
                metadata: { event: showName },
              });
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  // Pattern 2: Speaker cards — "Name\nTitle, Company"
  const speakerPattern = /<(?:strong|b|h[2-6])[^>]*>([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)<\/(?:strong|b|h[2-6])>[\s\S]{0,30}?(?:<[^>]+>)*\s*([^<]{5,100})/g;
  for (const match of html.matchAll(speakerPattern)) {
    const name = match[1].trim();
    const rest = match[2].replace(/<[^>]+>/g, "").trim();
    if (name.length > 4 && !seen.has(name.toLowerCase())) {
      // Try to split "Title, Company" or "Title at Company"
      const [role, company] = rest.includes(",")
        ? [rest.split(",")[0].trim(), rest.split(",").slice(1).join(",").trim()]
        : rest.includes(" at ")
          ? [rest.split(" at ")[0].trim(), rest.split(" at ").slice(1).join(" at ").trim()]
          : [rest, ""];

      if (/VP|Director|Manager|Chief|Officer|President|CEO|CTO|COO|Engineer|Head|Lead/i.test(role)) {
        seen.add(name.toLowerCase());
        const parts = name.split(/\s+/);
        people.push({
          name,
          firstName: parts[0],
          lastName: parts.slice(1).join(" "),
          role: role.slice(0, 100),
          company,
          source: sourceKey,
          sourceUrl,
          discoveredAt: new Date().toISOString(),
          metadata: { event: showName },
        });
      }
    }
  }

  return people;
}

export async function discoverFromTradeShows(): Promise<DiscoveredPerson[]> {
  const results: DiscoveredPerson[] = [];

  for (const src of SOURCES) {
    let total = 0;
    for (const url of src.urls) {
      try {
        const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        const html = await r.text();
        const people = extractSpeakers(html, url, src.name, src.source);
        results.push(...people);
        total += people.length;
      } catch { /* network error */ }
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log(`    ${src.name}: ${total} people`);
  }

  return results;
}
