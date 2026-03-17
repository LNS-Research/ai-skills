/**
 * 8-dimension scoring engine.
 * Max score = 100 (normalized from dimension maxes).
 *
 * Weights:
 *   earnings       25
 *   fundamentals   20
 *   analyst        15
 *   historical     10
 *   marketContext  10
 *   sector         10
 *   momentum        5
 *   sentiment       5
 *   ──────────────100
 */

import type { DimensionScores, Signal } from "./types.js";

export interface ScorerInput {
  // Price
  price: number;
  previousClose: number;
  week52High: number;
  week52Low: number;
  change1d: number;
  change1w?: number;

  // Volume
  volume: number;
  avgVolume: number;

  // Fundamentals
  pe: number | null;
  forwardPe: number | null;
  eps: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;

  // Analyst
  recommendationMean: number | null; // 1=Strong Buy, 5=Strong Sell
  targetMeanPrice: number | null;
  numberOfAnalysts: number | null;
  recentUpgrades: number;
  recentDowngrades: number;

  // Earnings
  recentSurprisePercent: number | null;

  // Insider
  insiderBuys: number;
  insiderSells: number;
}

export function scoreStock(input: ScorerInput): { score: number; scores: DimensionScores; signals: Signal[] } {
  const signals: Signal[] = [];

  // ── Earnings (max 25) ────────────────────────────────────────
  let earnings = 12; // neutral base
  if (input.recentSurprisePercent !== null) {
    if (input.recentSurprisePercent > 10) {
      earnings = 25;
      signals.push({ type: "bullish", source: "earnings", description: `Beat estimates by ${input.recentSurprisePercent.toFixed(1)}%`, confidence: 0.85 });
    } else if (input.recentSurprisePercent > 3) {
      earnings = 20;
      signals.push({ type: "bullish", source: "earnings", description: `Beat estimates by ${input.recentSurprisePercent.toFixed(1)}%`, confidence: 0.7 });
    } else if (input.recentSurprisePercent < -5) {
      earnings = 3;
      signals.push({ type: "bearish", source: "earnings", description: `Missed estimates by ${Math.abs(input.recentSurprisePercent).toFixed(1)}%`, confidence: 0.85 });
    } else if (input.recentSurprisePercent < 0) {
      earnings = 8;
      signals.push({ type: "bearish", source: "earnings", description: `Slight earnings miss (${input.recentSurprisePercent.toFixed(1)}%)`, confidence: 0.65 });
    }
  }

  // ── Fundamentals (max 20) ────────────────────────────────────
  let fundamentals = 10;
  let fundPoints = 0;

  if (input.pe !== null) {
    if (input.pe > 0 && input.pe < 15) fundPoints += 3;
    else if (input.pe >= 15 && input.pe < 30) fundPoints += 2;
    else if (input.pe >= 30 && input.pe < 60) fundPoints += 1;
    else if (input.pe <= 0 || input.pe > 100) fundPoints -= 1;
  }

  if (input.profitMargins !== null) {
    if (input.profitMargins > 0.2) fundPoints += 3;
    else if (input.profitMargins > 0.1) fundPoints += 2;
    else if (input.profitMargins > 0) fundPoints += 1;
    else fundPoints -= 1;
  }

  if (input.returnOnEquity !== null) {
    if (input.returnOnEquity > 0.2) fundPoints += 2;
    else if (input.returnOnEquity > 0.1) fundPoints += 1;
    else if (input.returnOnEquity < 0) fundPoints -= 1;
  }

  if (input.debtToEquity !== null) {
    if (input.debtToEquity < 0.5) fundPoints += 2;
    else if (input.debtToEquity < 1.5) fundPoints += 1;
    else if (input.debtToEquity > 3) fundPoints -= 2;
  }

  if (input.revenueGrowth !== null) {
    if (input.revenueGrowth > 0.2) fundPoints += 2;
    else if (input.revenueGrowth > 0.05) fundPoints += 1;
    else if (input.revenueGrowth < 0) fundPoints -= 1;
  }

  fundamentals = Math.min(20, Math.max(0, 10 + fundPoints));

  if (input.profitMargins !== null && input.profitMargins > 0.2) {
    signals.push({ type: "bullish", source: "fundamental", description: `Strong profit margins: ${(input.profitMargins * 100).toFixed(1)}%`, confidence: 0.75 });
  }
  if (input.debtToEquity !== null && input.debtToEquity > 3) {
    signals.push({ type: "bearish", source: "fundamental", description: `High debt/equity ratio: ${input.debtToEquity.toFixed(2)}`, confidence: 0.7 });
  }

  // ── Analyst Sentiment (max 15) ───────────────────────────────
  let analystSentiment = 7;
  if (input.recommendationMean !== null && input.numberOfAnalysts !== null && input.numberOfAnalysts >= 3) {
    // 1=Strong Buy, 5=Strong Sell → invert to 0-15
    const rawScore = (5 - input.recommendationMean) / 4 * 15;
    analystSentiment = Math.round(rawScore);

    if (input.recommendationMean <= 1.5) {
      signals.push({ type: "bullish", source: "analyst", description: `Strong Buy consensus (${input.numberOfAnalysts} analysts)`, confidence: 0.8 });
    } else if (input.recommendationMean >= 4) {
      signals.push({ type: "bearish", source: "analyst", description: `Sell consensus (${input.numberOfAnalysts} analysts)`, confidence: 0.8 });
    }
  }

  // Price vs target
  if (input.targetMeanPrice !== null && input.price > 0) {
    const upside = (input.targetMeanPrice - input.price) / input.price;
    if (upside > 0.2) {
      signals.push({ type: "bullish", source: "analyst", description: `${(upside * 100).toFixed(0)}% upside to analyst target ($${input.targetMeanPrice.toFixed(2)})`, confidence: 0.65 });
    } else if (upside < -0.1) {
      signals.push({ type: "bearish", source: "analyst", description: `Trading above analyst target by ${(Math.abs(upside) * 100).toFixed(0)}%`, confidence: 0.6 });
    }
  }

  // Recent upgrades/downgrades
  if (input.recentUpgrades > input.recentDowngrades + 1) {
    analystSentiment = Math.min(15, analystSentiment + 2);
    signals.push({ type: "bullish", source: "analyst", description: `${input.recentUpgrades} analyst upgrades in past 30 days`, confidence: 0.7 });
  } else if (input.recentDowngrades > input.recentUpgrades + 1) {
    analystSentiment = Math.max(0, analystSentiment - 2);
    signals.push({ type: "bearish", source: "analyst", description: `${input.recentDowngrades} analyst downgrades in past 30 days`, confidence: 0.7 });
  }

  // ── Historical (max 10) ──────────────────────────────────────
  const priceRange = input.week52High - input.week52Low;
  let historical = 5;
  if (priceRange > 0) {
    const positionInRange = (input.price - input.week52Low) / priceRange;
    if (positionInRange > 0.8) {
      historical = 8; // Near 52w high — momentum
      signals.push({ type: "bullish", source: "momentum", description: `Near 52-week high (top ${((1 - positionInRange) * 100).toFixed(0)}%)`, confidence: 0.6 });
    } else if (positionInRange < 0.2) {
      historical = 3; // Near 52w low — possible value or distress
      signals.push({ type: "bearish", source: "momentum", description: `Near 52-week low (bottom ${(positionInRange * 100).toFixed(0)}%)`, confidence: 0.6 });
    } else {
      historical = 5 + Math.round(positionInRange * 4);
    }
  }

  // ── Market Context (max 10) ──────────────────────────────────
  // Without real-time VIX/market data, use 1-week change as proxy
  let marketContext = 6;
  const change1w = input.change1w ?? 0;
  if (change1w > 3) marketContext = 8;
  else if (change1w < -3) marketContext = 4;

  // ── Sector (max 10) ─────────────────────────────────────────
  // Compare stock change vs market (rough sector proxy — can be enhanced with sector ETF data)
  const sectorScore = 5; // neutral — would need sector ETF fetch to do properly

  // ── Momentum (max 5) ─────────────────────────────────────────
  let momentum = 2;
  const volumeRatio = input.avgVolume > 0 ? input.volume / input.avgVolume : 1;
  if (input.change1d > 3 && volumeRatio > 1.5) {
    momentum = 5;
    signals.push({ type: "bullish", source: "momentum", description: `Strong volume spike (${volumeRatio.toFixed(1)}x avg) with price gain`, confidence: 0.75 });
  } else if (input.change1d < -3 && volumeRatio > 1.5) {
    momentum = 0;
    signals.push({ type: "bearish", source: "momentum", description: `High-volume sell-off (${volumeRatio.toFixed(1)}x avg volume)`, confidence: 0.75 });
  } else if (input.change1d > 1) {
    momentum = 4;
  } else if (input.change1d < -1) {
    momentum = 1;
  } else {
    momentum = 2;
  }

  // ── Sentiment / Insider (max 5) ──────────────────────────────
  let sentiment = 2;
  const netInsider = input.insiderBuys - input.insiderSells;
  if (netInsider >= 3) {
    sentiment = 5;
    signals.push({ type: "bullish", source: "insider", description: `${input.insiderBuys} insider buys in past 30 days`, confidence: 0.8 });
  } else if (netInsider >= 1) {
    sentiment = 4;
    signals.push({ type: "bullish", source: "insider", description: `Net insider buying (${input.insiderBuys}B / ${input.insiderSells}S)`, confidence: 0.7 });
  } else if (netInsider <= -3) {
    sentiment = 0;
    signals.push({ type: "bearish", source: "insider", description: `${input.insiderSells} insider sells in past 30 days`, confidence: 0.75 });
  } else if (netInsider <= -1) {
    sentiment = 1;
    signals.push({ type: "bearish", source: "insider", description: `Net insider selling (${input.insiderBuys}B / ${input.insiderSells}S)`, confidence: 0.6 });
  }

  const scores: DimensionScores = {
    earnings,
    fundamentals,
    analystSentiment,
    historical,
    marketContext,
    sector: sectorScore,
    momentum,
    sentiment,
  };

  const score = earnings + fundamentals + analystSentiment + historical + marketContext + sectorScore + momentum + sentiment;

  return { score, scores, signals };
}

export function analystRatingLabel(mean: number | null): "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | null {
  if (mean === null) return null;
  if (mean <= 1.5) return "Strong Buy";
  if (mean <= 2.5) return "Buy";
  if (mean <= 3.5) return "Hold";
  if (mean <= 4.5) return "Sell";
  return "Strong Sell";
}
