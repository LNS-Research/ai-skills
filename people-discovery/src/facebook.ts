/**
 * Facebook company page scraper — finds leadership from public FB pages.
 *
 * Many manufacturing companies list leadership on Facebook even if they
 * don't maintain LinkedIn profiles. Plant managers in rural areas are
 * more likely found here than LinkedIn.
 */

import type { DiscoveredPerson } from "./index.js";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml",
};

async function searchFacebookPage(companyName: string): Promise<string | null> {
  const query = `site:facebook.com "${companyName}" about`;
  try {
    const r = await fetch(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`,
      { headers: HEADERS }
    );
    if (!r.ok) return null;
    const text = await r.text();
    const urls = text.match(/https:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/g) || [];
    const skip = ["facebook.com/login", "facebook.com/help", "facebook.com/policies"];
    return urls.find(u => !skip.some(s => u.includes(s))) ?? null;
  } catch {
    return null;
  }
}

async function scrapeAboutPage(fbUrl: string, companyName: string, ticker?: string): Promise<DiscoveredPerson[]> {
  const aboutUrl = fbUrl.replace(/\/$/, "") + "/about";
  const people: DiscoveredPerson[] = [];

  try {
    const r = await fetch(aboutUrl, { headers: HEADERS, redirect: "follow" });
    if (!r.ok) return [];
    const text = await r.text();

    // JSON-LD structured data
    const ldMatches = text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
    for (const match of ldMatches) {
      try {
        const ld = JSON.parse(match[1]);
        for (const key of ["founder", "employee", "member"]) {
          const val = ld[key];
          if (Array.isArray(val)) {
            for (const person of val) {
              if (person?.name && person.name.includes(" ")) {
                people.push(makePerson(person.name, person.jobTitle || key, companyName, aboutUrl, ticker));
              }
            }
          } else if (val?.name) {
            people.push(makePerson(val.name, val.jobTitle || key, companyName, aboutUrl, ticker));
          }
        }
      } catch { /* skip bad JSON-LD */ }
    }

    // Text patterns: "CEO: John Smith" etc.
    const rolePattern = /(?:CEO|President|COO|CFO|CTO|VP|Director|Manager|Owner|Founder|General Manager|Plant Manager|Operations Manager)[:\s\-–]+([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g;
    for (const match of text.matchAll(rolePattern)) {
      const name = match[1].trim();
      const role = match[0].split(/[:\-–]/)[0].trim();
      if (name.length > 4) {
        people.push(makePerson(name, role, companyName, aboutUrl, ticker));
      }
    }
  } catch { /* network error */ }

  return people;
}

function makePerson(name: string, role: string, company: string, sourceUrl: string, ticker?: string): DiscoveredPerson {
  const parts = name.trim().split(/\s+/);
  return {
    name: name.trim(),
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    role,
    company,
    ticker,
    source: "facebook_page",
    sourceUrl,
    discoveredAt: new Date().toISOString(),
  };
}

export async function discoverFromFacebook(companyName: string, ticker?: string): Promise<DiscoveredPerson[]> {
  const fbUrl = await searchFacebookPage(companyName);
  if (!fbUrl) return [];
  return scrapeAboutPage(fbUrl, companyName, ticker);
}
