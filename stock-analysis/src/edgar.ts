/**
 * SEC EDGAR client for Form 4 insider trades (free, no API key).
 * https://efts.sec.gov/LATEST/search-index — full-text search
 * https://data.sec.gov/submissions/ — company filings
 */

import type { InsiderTrade } from "./types.js";

const HEADERS = {
  "User-Agent": "lns-skills/1.0 contact@lns.com",
  Accept: "application/json",
};

/** Look up company CIK by ticker symbol */
async function getCIK(symbol: string): Promise<string | null> {
  try {
    const r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: HEADERS });
    if (!r.ok) return null;
    const data = await r.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
    const upper = symbol.toUpperCase();
    const entry = Object.values(data).find(e => e.ticker.toUpperCase() === upper);
    return entry ? String(entry.cik_str).padStart(10, "0") : null;
  } catch {
    return null;
  }
}

/** Fetch recent Form 4 filings for a company */
export async function fetchInsiderTrades(symbol: string, daysBack = 30): Promise<InsiderTrade[]> {
  try {
    const cik = await getCIK(symbol);
    if (!cik) return [];

    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return [];
    const data = await r.json() as any;

    const filings = data?.filings?.recent;
    if (!filings) return [];

    const { form, filingDate, primaryDocument } = filings as {
      form: string[];
      filingDate: string[];
      primaryDocument: string[];
      accessionNumber: string[];
    };

    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const trades: InsiderTrade[] = [];

    for (let i = 0; i < form.length && trades.length < 10; i++) {
      if (form[i] !== "4" && form[i] !== "4/A") continue;
      if (filingDate[i] < cutoff) break; // filings are newest-first

      // Parse the XML for transaction details
      const accession = filings.accessionNumber[i].replace(/-/g, "");
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accession}/${primaryDocument[i]}`;

      try {
        const xmlRes = await fetch(xmlUrl, { headers: HEADERS });
        if (!xmlRes.ok) continue;
        const xml = await xmlRes.text();
        const trade = parseForm4XML(xml, filingDate[i]);
        if (trade) trades.push(trade);
      } catch {
        continue;
      }
    }

    return trades;
  } catch {
    return [];
  }
}

function parseForm4XML(xml: string, filedDate: string): InsiderTrade | null {
  try {
    const get = (tag: string) => xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, "s"))?.[1]?.trim() ?? null;

    const filerName = get("rptOwnerName") ?? "Unknown";
    const title = get("officerTitle") ?? get("relationship") ?? "Insider";
    const transCode = get("transactionCode") ?? "";
    const shares = parseFloat(get("transactionShares") ?? "0") || 0;
    const pricePerShare = parseFloat(get("transactionPricePerShare") ?? "") || null;
    const totalValue = pricePerShare !== null ? shares * pricePerShare : null;

    const typeMap: Record<string, InsiderTrade["transactionType"]> = {
      P: "buy",  // Purchase
      S: "sell", // Sale
      A: "buy",  // Award
      D: "sell", // Disposition
      F: "sell", // Tax withholding
      G: "other",
      J: "other",
      K: "other",
      L: "other",
      M: "other",
      O: "other",
      U: "other",
      W: "other",
      X: "other",
    };

    const transactionType = typeMap[transCode] ?? "other";

    return {
      filerName,
      title,
      transactionType,
      shares,
      pricePerShare,
      totalValue,
      filedDate,
    };
  } catch {
    return null;
  }
}
