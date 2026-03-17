/**
 * Yahoo Finance unofficial API client — no API key required.
 * Uses query1/query2 endpoints for quotes and full fundamentals.
 */

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Accept: "application/json",
};

export interface YahooQuote {
  symbol: string;
  shortName: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume3Month: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  regularMarketPreviousClose: number;
}

export interface YahooSummary {
  recommendationMean?: number;
  recommendationKey?: string;
  targetMeanPrice?: number;
  numberOfAnalystOpinions?: number;
  profitMargins?: number;
  operatingMargins?: number;
  returnOnEquity?: number;
  debtToEquity?: number;
  currentRatio?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  freeCashflow?: number;
  earningsTrend?: Array<{
    period: string;
    earningsEstimate: { avg: number };
    revenueEstimate: { avg: number };
    epsDifference?: number;
    surprisePercent?: number;
  }>;
  upgradeDowngradeHistory?: Array<{
    epochGradeDate: number;
    firm: string;
    toGrade: string;
    fromGrade?: string;
    action: string;
  }>;
  weekChange?: number;
}

export async function fetchQuote(symbol: string): Promise<YahooQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    // Weekly change from 5d range
    const closes: number[] = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter(Boolean);
    const weekChange = validCloses.length >= 2
      ? ((validCloses[validCloses.length - 1] - validCloses[0]) / validCloses[0]) * 100
      : 0;

    return {
      symbol: meta.symbol,
      shortName: meta.shortName ?? symbol,
      longName: meta.longName,
      regularMarketPrice: meta.regularMarketPrice ?? 0,
      regularMarketChangePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
      regularMarketVolume: meta.regularMarketVolume ?? 0,
      averageDailyVolume3Month: meta.regularMarketVolume ?? 0,
      marketCap: undefined,
      trailingPE: undefined,
      forwardPE: undefined,
      epsTrailingTwelveMonths: undefined,
      dividendYield: undefined,
      fiftyTwoWeekHigh: meta["52WeekHigh"] ?? 0,
      fiftyTwoWeekLow: meta["52WeekLow"] ?? 0,
      regularMarketPreviousClose: meta.chartPreviousClose ?? 0,
      // attach week change as extra
      ...(weekChange ? { _weekChange: weekChange } : {}),
    } as YahooQuote & { _weekChange?: number };
  } catch {
    return null;
  }
}

export async function fetchSummary(symbol: string): Promise<(YahooQuote & YahooSummary) | null> {
  const modules = [
    "price",
    "summaryDetail",
    "defaultKeyStatistics",
    "financialData",
    "earningsTrend",
    "upgradeDowngradeHistory",
    "recommendationTrend",
  ].join(",");
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;

  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const result = d?.quoteSummary?.result?.[0];
    if (!result) return null;

    const price = result.price ?? {};
    const summary = result.summaryDetail ?? {};
    const stats = result.defaultKeyStatistics ?? {};
    const financial = result.financialData ?? {};
    const trend = result.upgradeDowngradeHistory?.history ?? [];

    return {
      symbol: price.symbol ?? symbol,
      shortName: price.shortName?.raw ?? price.shortName ?? symbol,
      longName: price.longName?.raw ?? price.longName,
      regularMarketPrice: price.regularMarketPrice?.raw ?? 0,
      regularMarketChangePercent: price.regularMarketChangePercent?.raw ?? 0,
      regularMarketVolume: price.regularMarketVolume?.raw ?? 0,
      averageDailyVolume3Month: summary.averageVolume?.raw ?? 0,
      marketCap: price.marketCap?.raw ?? null,
      trailingPE: summary.trailingPE?.raw ?? null,
      forwardPE: summary.forwardPE?.raw ?? null,
      epsTrailingTwelveMonths: stats.trailingEps?.raw ?? null,
      dividendYield: summary.dividendYield?.raw ?? null,
      fiftyTwoWeekHigh: summary.fiftyTwoWeekHigh?.raw ?? 0,
      fiftyTwoWeekLow: summary.fiftyTwoWeekLow?.raw ?? 0,
      regularMarketPreviousClose: price.regularMarketPreviousClose?.raw ?? 0,
      recommendationMean: financial.recommendationMean?.raw ?? null,
      recommendationKey: financial.recommendationKey ?? null,
      targetMeanPrice: financial.targetMeanPrice?.raw ?? null,
      numberOfAnalystOpinions: financial.numberOfAnalystOpinions?.raw ?? null,
      profitMargins: financial.profitMargins?.raw ?? null,
      operatingMargins: financial.operatingMargins?.raw ?? null,
      returnOnEquity: financial.returnOnEquity?.raw ?? null,
      debtToEquity: financial.debtToEquity?.raw ?? null,
      currentRatio: financial.currentRatio?.raw ?? null,
      revenueGrowth: financial.revenueGrowth?.raw ?? null,
      earningsGrowth: financial.earningsGrowth?.raw ?? null,
      freeCashflow: financial.freeCashflow?.raw ?? null,
      earningsTrend: result.earningsTrend?.trend ?? [],
      upgradeDowngradeHistory: trend.slice(0, 10),
    };
  } catch {
    return null;
  }
}

/** Fetch top movers (gainers + losers) from Yahoo Finance screener */
export async function fetchTopMovers(): Promise<Array<{ symbol: string; name: string; price: number; change: number; volume: number }>> {
  try {
    const url = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=25&formatted=true";
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return [];
    const d = await r.json() as any;
    const quotes = d?.finance?.result?.[0]?.quotes ?? [];
    return quotes.map((q: any) => ({
      symbol: q.symbol,
      name: q.shortName ?? q.symbol,
      price: q.regularMarketPrice?.raw ?? 0,
      change: q.regularMarketChangePercent?.raw ?? 0,
      volume: q.regularMarketVolume?.raw ?? 0,
    }));
  } catch {
    return [];
  }
}

/** Fetch news headlines for a symbol via Yahoo Finance RSS */
export async function fetchNews(symbol: string, limit = 5): Promise<Array<{ title: string; link: string; date: string }>> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return [];
    const text = await r.text();
    const items: Array<{ title: string; link: string; date: string }> = [];
    const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const m of itemMatches) {
      if (items.length >= limit) break;
      const block = m[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const date = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      if (title) items.push({ title: title.trim(), link: link.trim(), date: date.trim() });
    }
    return items;
  } catch {
    return [];
  }
}
