/**
 * Hot Scanner — finds viral/trending stocks with unusual volume + price moves.
 * Rumor Scanner — detects M&A, insider clusters, analyst action bursts.
 */

import { fetchTopMovers, fetchNews } from "./yahoo.js";
import { fetchTrendingCrypto } from "./coingecko.js";
import type { HotStock, Rumor } from "./types.js";

export interface ScanResult {
  hotStocks: HotStock[];
  hotCrypto: Array<{ id: string; symbol: string; name: string; rank: number }>;
  rumors: Rumor[];
  scannedAt: string;
}

const MA_KEYWORDS = [
  "acqui", "merger", "takeover", "bid for", "buyout", "deal", "offer to buy",
  "strategic review", "activist investor", "stake in", "purchase of",
];

const SQUEEZE_KEYWORDS = [
  "short squeeze", "short interest", "most shorted", "gamma squeeze", "squeeze play",
];

export async function runHotScanner(): Promise<ScanResult> {
  const [movers, hotCrypto] = await Promise.all([
    fetchTopMovers(),
    fetchTrendingCrypto(),
  ]);

  const hotStocks: HotStock[] = movers
    .filter(m => Math.abs(m.change) >= 3)
    .slice(0, 15)
    .map(m => ({
      symbol: m.symbol,
      name: m.name,
      price: m.price,
      change1d: m.change,
      volumeRatio: 1, // screener doesn't return avg volume — would need per-ticker fetch
      reason: m.change > 0
        ? `+${m.change.toFixed(1)}% today — top gainer`
        : `${m.change.toFixed(1)}% today — heavy selling`,
    }));

  const rumors = await scanRumors(hotStocks.slice(0, 5).map(s => s.symbol));

  return {
    hotStocks,
    hotCrypto,
    rumors,
    scannedAt: new Date().toISOString(),
  };
}

/** Scan news for M&A rumors, squeeze signals for a set of symbols */
async function scanRumors(symbols: string[]): Promise<Rumor[]> {
  const rumors: Rumor[] = [];

  await Promise.all(
    symbols.map(async symbol => {
      const headlines = await fetchNews(symbol, 10);
      for (const h of headlines) {
        const title = h.title.toLowerCase();

        const isMa = MA_KEYWORDS.some(k => title.includes(k));
        const isSqueeze = SQUEEZE_KEYWORDS.some(k => title.includes(k));

        if (isMa) {
          rumors.push({
            symbol,
            type: "ma",
            description: h.title,
            source: "Yahoo Finance News",
            date: h.date || new Date().toISOString(),
            impact: "high",
          });
        } else if (isSqueeze) {
          rumors.push({
            symbol,
            type: "short_squeeze",
            description: h.title,
            source: "Yahoo Finance News",
            date: h.date || new Date().toISOString(),
            impact: "medium",
          });
        }
      }
    }),
  );

  return rumors;
}

/** Watchlist monitoring — call periodically with user's tracked symbols */
export interface WatchlistAlert {
  symbol: string;
  type: "price_spike" | "price_drop" | "volume_spike" | "rumor";
  description: string;
  threshold: number;
  actual: number;
}

export async function checkWatchlist(
  symbols: string[],
  thresholds: { priceChange?: number; volumeRatio?: number } = {},
): Promise<WatchlistAlert[]> {
  const { priceChange = 5, volumeRatio = 2 } = thresholds;
  const alerts: WatchlistAlert[] = [];

  // Batch fetch via Yahoo Finance chart API (no summary needed)
  await Promise.all(
    symbols.map(async symbol => {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" } },
        );
        if (!r.ok) return;
        const d = await r.json() as any;
        const meta = d?.chart?.result?.[0]?.meta;
        if (!meta) return;

        const changePct = ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100;

        if (changePct >= priceChange) {
          alerts.push({ symbol, type: "price_spike", description: `Up ${changePct.toFixed(1)}% today`, threshold: priceChange, actual: changePct });
        } else if (changePct <= -priceChange) {
          alerts.push({ symbol, type: "price_drop", description: `Down ${Math.abs(changePct).toFixed(1)}% today`, threshold: priceChange, actual: Math.abs(changePct) });
        }
      } catch {
        // skip
      }
    }),
  );

  return alerts;
}
