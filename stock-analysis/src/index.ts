/**
 * @lns-skills/stock-analysis
 *
 * Multi-dimensional stock & crypto analysis with Hot Scanner and Rumor Scanner.
 * All data sources are free (Yahoo Finance, SEC EDGAR, CoinGecko).
 * AI-powered summary and sentiment via Claude Haiku.
 *
 * DISCLAIMER: NOT FINANCIAL ADVICE. For informational purposes only.
 * Consult a licensed financial advisor before making investment decisions.
 *
 * Usage:
 *   import { createStockAnalyzer } from "@lns-skills/stock-analysis";
 *
 *   const analyzer = createStockAnalyzer({ anthropicApiKey: process.env.ANTHROPIC_API_KEY! });
 *   const result = await analyzer.analyze("AAPL");
 *   const crypto = await analyzer.analyzeCrypto("BTC");
 *   const hot = await analyzer.scan();
 */

export type { StockAnalysis, CryptoAnalysis, HotStock, Rumor, Signal, DimensionScores, StockAnalysisConfig } from "./types.js";
export { runHotScanner, checkWatchlist } from "./scanner.js";

import { fetchSummary, fetchNews } from "./yahoo.js";
import { fetchInsiderTrades } from "./edgar.js";
import { fetchCrypto } from "./coingecko.js";
import { scoreStock, analystRatingLabel } from "./scorer.js";
import { runHotScanner } from "./scanner.js";
import type { StockAnalysis, CryptoAnalysis, StockAnalysisConfig, Signal } from "./types.js";

const DISCLAIMER = "NOT FINANCIAL ADVICE. For informational purposes only. Data may be delayed 15-20 minutes. Consult a licensed financial advisor before making investment decisions.";

export function createStockAnalyzer(config: StockAnalysisConfig) {
  const model = config.model ?? "claude-haiku-4-5-20251001";

  async function aiSummarize(prompt: string): Promise<string> {
    if (config.skipAI) return "";
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system: "You are a concise financial analyst. Provide objective, fact-based analysis in 2-3 sentences. Never give buy/sell advice.",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const d = await r.json() as { content?: { text?: string }[] };
      return d.content?.[0]?.text?.trim() ?? "";
    } catch {
      return "";
    }
  }

  return {
    /** Full 8-dimension analysis for a stock ticker */
    async analyze(symbol: string): Promise<StockAnalysis> {
      const upperSymbol = symbol.toUpperCase();

      const [summaryData, newsHeadlines, insiderTrades] = await Promise.all([
        fetchSummary(upperSymbol),
        fetchNews(upperSymbol, 5),
        config.skipInsider ? Promise.resolve([]) : fetchInsiderTrades(upperSymbol, 30),
      ]);

      if (!summaryData) {
        throw new Error(`No data found for symbol: ${upperSymbol}`);
      }

      const insiderBuys = insiderTrades.filter(t => t.transactionType === "buy").length;
      const insiderSells = insiderTrades.filter(t => t.transactionType === "sell").length;

      // Parse recent earnings surprise
      const trend = summaryData.earningsTrend ?? [];
      const recentSurprise = trend.find(t => t.period === "0q") ?? trend[0];
      const recentSurprisePercent = recentSurprise?.surprisePercent ?? null;

      // Parse recent upgrades/downgrades (last 30d)
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentHistory = (summaryData.upgradeDowngradeHistory ?? []).filter(
        h => h.epochGradeDate * 1000 > cutoff,
      );
      const recentUpgrades = recentHistory.filter(h =>
        ["upgrade", "initiated", "reiterated"].includes(h.action?.toLowerCase() ?? "") &&
        ["buy", "outperform", "overweight", "strong buy"].some(g => (h.toGrade ?? "").toLowerCase().includes(g)),
      ).length;
      const recentDowngrades = recentHistory.filter(h =>
        ["downgrade"].includes(h.action?.toLowerCase() ?? "") ||
        ["sell", "underperform", "underweight"].some(g => (h.toGrade ?? "").toLowerCase().includes(g)),
      ).length;

      const change1d = summaryData.regularMarketChangePercent ?? 0;
      const { score, scores, signals } = scoreStock({
        price: summaryData.regularMarketPrice,
        previousClose: summaryData.regularMarketPreviousClose,
        week52High: summaryData.fiftyTwoWeekHigh,
        week52Low: summaryData.fiftyTwoWeekLow,
        change1d,
        change1w: (summaryData as any)._weekChange,
        volume: summaryData.regularMarketVolume,
        avgVolume: summaryData.averageDailyVolume3Month,
        pe: summaryData.trailingPE ?? null,
        forwardPe: summaryData.forwardPE ?? null,
        eps: summaryData.epsTrailingTwelveMonths ?? null,
        profitMargins: summaryData.profitMargins ?? null,
        operatingMargins: summaryData.operatingMargins ?? null,
        returnOnEquity: summaryData.returnOnEquity ?? null,
        debtToEquity: summaryData.debtToEquity ?? null,
        revenueGrowth: summaryData.revenueGrowth ?? null,
        earningsGrowth: summaryData.earningsGrowth ?? null,
        recommendationMean: summaryData.recommendationMean ?? null,
        targetMeanPrice: summaryData.targetMeanPrice ?? null,
        numberOfAnalysts: summaryData.numberOfAnalystOpinions ?? null,
        recentUpgrades,
        recentDowngrades,
        recentSurprisePercent,
        insiderBuys,
        insiderSells,
      });

      const newsText = newsHeadlines.map(h => h.title).join("; ");
      const topSignals = signals.slice(0, 3).map(s => s.description).join("; ");
      const summary = await aiSummarize(
        `Analyze ${upperSymbol} (${summaryData.shortName}). Price: $${summaryData.regularMarketPrice.toFixed(2)}, ` +
        `1d change: ${change1d.toFixed(1)}%, composite score: ${score}/100. ` +
        `Key signals: ${topSignals || "none"}. ` +
        `Recent headlines: ${newsText || "none"}. ` +
        `Provide a concise 2-3 sentence analysis.`,
      );

      return {
        symbol: upperSymbol,
        name: summaryData.shortName ?? summaryData.longName ?? upperSymbol,
        price: summaryData.regularMarketPrice,
        change1d,
        change1w: (summaryData as any)._weekChange ?? 0,
        volume: summaryData.regularMarketVolume,
        avgVolume: summaryData.averageDailyVolume3Month,
        marketCap: summaryData.marketCap ?? null,
        pe: summaryData.trailingPE ?? null,
        forwardPe: summaryData.forwardPE ?? null,
        eps: summaryData.epsTrailingTwelveMonths ?? null,
        dividendYield: summaryData.dividendYield ?? null,
        analystRating: analystRatingLabel(summaryData.recommendationMean ?? null),
        analystTarget: summaryData.targetMeanPrice ?? null,
        week52High: summaryData.fiftyTwoWeekHigh,
        week52Low: summaryData.fiftyTwoWeekLow,
        insiderTrades,
        signals,
        score,
        scores,
        summary,
        disclaimer: DISCLAIMER,
      };
    },

    /** Crypto analysis via CoinGecko */
    async analyzeCrypto(symbolOrId: string): Promise<CryptoAnalysis> {
      const data = await fetchCrypto(symbolOrId);
      if (!data) throw new Error(`No crypto data found for: ${symbolOrId}`);

      const signals: Signal[] = [];

      if (data.price_change_percentage_24h > 10) {
        signals.push({ type: "bullish", source: "momentum", description: `+${data.price_change_percentage_24h.toFixed(1)}% in 24h`, confidence: 0.7 });
      } else if (data.price_change_percentage_24h < -10) {
        signals.push({ type: "bearish", source: "momentum", description: `${data.price_change_percentage_24h.toFixed(1)}% in 24h`, confidence: 0.7 });
      }

      if (data.price_change_percentage_7d_in_currency > 20) {
        signals.push({ type: "bullish", source: "momentum", description: `+${data.price_change_percentage_7d_in_currency.toFixed(1)}% this week`, confidence: 0.65 });
      }

      const athDropPct = ((data.ath - data.current_price) / data.ath) * 100;
      if (athDropPct < 10) {
        signals.push({ type: "bullish", source: "momentum", description: `Near all-time high (${athDropPct.toFixed(1)}% below ATH)`, confidence: 0.6 });
      } else if (athDropPct > 70) {
        signals.push({ type: "bearish", source: "fundamental", description: `${athDropPct.toFixed(0)}% below ATH ($${data.ath.toLocaleString()})`, confidence: 0.5 });
      }

      const score = Math.round(50 +
        (data.price_change_percentage_24h > 0 ? Math.min(15, data.price_change_percentage_24h) : Math.max(-15, data.price_change_percentage_24h)) +
        (data.price_change_percentage_7d_in_currency > 0 ? Math.min(10, data.price_change_percentage_7d_in_currency / 2) : Math.max(-10, data.price_change_percentage_7d_in_currency / 2)) +
        Math.min(10, Math.max(-10, (100 - athDropPct) / 5 - 10)) +
        (data.market_cap_rank <= 10 ? 5 : data.market_cap_rank <= 20 ? 3 : 0),
      );

      const summary = await aiSummarize(
        `Analyze ${data.symbol.toUpperCase()} (${data.name}). Price: $${data.current_price.toLocaleString()}, ` +
        `24h: ${data.price_change_percentage_24h.toFixed(1)}%, 7d: ${data.price_change_percentage_7d_in_currency.toFixed(1)}%, ` +
        `market cap rank: #${data.market_cap_rank}, ${athDropPct.toFixed(0)}% below ATH. ` +
        `Provide a concise 2-3 sentence analysis.`,
      );

      return {
        id: data.id,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        price: data.current_price,
        change1d: data.price_change_percentage_24h,
        change7d: data.price_change_percentage_7d_in_currency,
        change30d: data.price_change_percentage_30d_in_currency,
        volume24h: data.total_volume,
        marketCap: data.market_cap,
        rank: data.market_cap_rank,
        ath: data.ath,
        athDate: data.ath_date,
        signals,
        score: Math.min(100, Math.max(0, score)),
        summary,
        disclaimer: DISCLAIMER,
      };
    },

    /** Hot Scanner — trending stocks + crypto with unusual activity */
    async scan() {
      return runHotScanner();
    },
  };
}
