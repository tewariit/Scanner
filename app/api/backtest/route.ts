import { analyze, fetchChart, universe, type Candle, type Signal } from "@/lib/technical-engine";

type Trade = {
  symbol: string; signal: Exclude<Signal, "Watch">; score: number; entryTime: number; exitTime: number;
  date: string; exitDate: string; entry: number; stop: number; target: number; resultR: number;
  outcome: "WIN" | "LOSS" | "TIME"; holdBars: number;
};

const FEE_RATE = 0.0015;
const HOLDING_BARS = 20;

function simulateTrade(symbol: string, signal: Exclude<Signal, "Watch">, score: number, candles: Candle[], signalIndex: number, currentAtr: number): Trade | null {
  const entryIndex = signalIndex + 1;
  const entryCandle = candles[entryIndex];
  if (!entryCandle || currentAtr <= 0) return null;
  const entry = entryCandle.open;
  const risk = currentAtr * 1.2;
  const stop = entry - risk;
  const target = entry + risk * 2;
  const lastIndex = Math.min(candles.length - 1, entryIndex + HOLDING_BARS);
  let exitIndex = lastIndex;
  let rawR = (candles[lastIndex].close - entry) / risk;
  let outcome: Trade["outcome"] = "TIME";

  for (let index = entryIndex; index <= lastIndex; index += 1) {
    const candle = candles[index];
    const stopHit = candle.low <= stop;
    const targetHit = candle.high >= target;
    if (stopHit) { rawR = -1; outcome = "LOSS"; exitIndex = index; break; }
    if (targetHit) { rawR = 2; outcome = "WIN"; exitIndex = index; break; }
  }
  const costR = (entry * FEE_RATE) / risk;
  const resultR = Math.round((rawR - costR) * 100) / 100;
  if (outcome === "TIME") outcome = resultR > 0 ? "WIN" : "LOSS";
  return {
    symbol, signal, score, entryTime: entryCandle.time, exitTime: candles[exitIndex].time,
    date: new Date(entryCandle.time * 1000).toISOString().slice(0, 10),
    exitDate: new Date(candles[exitIndex].time * 1000).toISOString().slice(0, 10),
    entry, stop, target, resultR, outcome, holdBars: exitIndex - entryIndex + 1,
  };
}

function generateCandidates(symbol: string, name: string, sector: string, candles: Candle[], cutoff: number) {
  const candidates: Trade[] = [];
  for (let index = 60; index < candles.length - 1; index += 1) {
    if (candles[index].time < cutoff) continue;
    const result = analyze(symbol, name, sector, candles.slice(0, index + 1));
    if (result.signal === "Watch" || result.score < 60) continue;
    const trade = simulateTrade(symbol, result.signal, result.score, candles, index, result.atr);
    if (trade) candidates.push(trade);
  }
  return candidates;
}

function selectPortfolio(candidates: Trade[], minScore: number, signal: string) {
  const eligible = candidates.filter((trade) => trade.score >= minScore && (signal === "all" || trade.signal === signal));
  const dates = [...new Set(eligible.map((trade) => trade.date))].sort();
  const availableAfter = new Map<string, number>();
  const selected: Trade[] = [];
  for (const date of dates) {
    const dayTrades = eligible.filter((trade) => trade.date === date && trade.entryTime > (availableAfter.get(trade.symbol) ?? 0)).sort((a, b) => b.score - a.score).slice(0, 2);
    for (const trade of dayTrades) { selected.push(trade); availableAfter.set(trade.symbol, trade.exitTime); }
  }
  return selected.sort((a, b) => a.entryTime - b.entryTime);
}

function metrics(trades: Trade[]) {
  const wins = trades.filter((trade) => trade.resultR > 0);
  const losses = trades.filter((trade) => trade.resultR <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.resultR, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.resultR, 0));
  let equity = 0, peak = 0, maxDrawdown = 0;
  const equityCurve = trades.map((trade) => {
    equity += trade.resultR; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity);
    return { time: trade.entryTime, equity: Math.round(equity * 100) / 100 };
  });
  return {
    total: trades.length, wins: wins.length, losses: losses.length,
    winRate: trades.length ? wins.length / trades.length * 100 : 0,
    netR: Math.round(equity * 100) / 100,
    expectancy: trades.length ? Math.round(equity / trades.length * 100) / 100 : 0,
    profitFactor: grossLoss ? Math.round(grossProfit / grossLoss * 100) / 100 : grossProfit ? 99 : 0,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    averageWin: wins.length ? Math.round(grossProfit / wins.length * 100) / 100 : 0,
    averageLoss: losses.length ? Math.round(grossLoss / losses.length * 100) / 100 : 0,
    equityCurve,
  };
}

function groupMetrics(trades: Trade[], key: "signal" | "symbol") {
  return [...new Set(trades.map((trade) => trade[key]))].map((value) => ({ name: value, ...metrics(trades.filter((trade) => trade[key] === value)) })).sort((a, b) => b.expectancy - a.expectancy);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const years = [1, 3, 5].includes(Number(params.get("years"))) ? Number(params.get("years")) : 3;
  const minScore = [60, 70, 80].includes(Number(params.get("score"))) ? Number(params.get("score")) : 80;
  const signal = ["all", "Breakout", "Pullback", "Momentum"].includes(params.get("signal") ?? "") ? params.get("signal")! : "all";
  const cutoff = Math.floor(Date.now() / 1000) - years * 365.25 * 86400;
  try {
    const settled = await Promise.allSettled(universe.map(async ([symbol, name, sector]) => {
      const candles = await fetchChart(`${symbol}.BK`, "1d", "5y", 3600);
      if (candles.length < 120) throw new Error("insufficient history");
      return generateCandidates(symbol, name, sector, candles, cutoff);
    }));
    const candidates = settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
    const trades = selectPortfolio(candidates, minScore, signal);
    const comparisons = [60, 70, 80].map((score) => ({ score, ...metrics(selectPortfolio(candidates, score, signal)) }));
    return Response.json({
      assumptions: { years, timeframe: "1D", minScore, signal, rr: 2, atrStop: 1.2, maxTradesPerDay: 2, holdingBars: HOLDING_BARS, feeRate: FEE_RATE, entry: "next_open", sameBarRule: "stop_first" },
      coverage: { requested: universe.length, succeeded: settled.filter((item) => item.status === "fulfilled").length },
      metrics: metrics(trades), comparisons, bySignal: groupMetrics(trades, "signal"), byStock: groupMetrics(trades, "symbol").slice(0, 10),
      recentTrades: trades.slice(-12).reverse(), source: "Yahoo Finance historical · reference only", generatedAt: Date.now(),
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backtest ไม่สำเร็จ" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
