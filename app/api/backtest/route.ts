import { analyze, detectStructure, fetchChart, marketUniverses, resampleFourHour, structureEntryScore, type Candle, type MarketUniverseKey } from "@/lib/technical-engine";

type Trade = {
  symbol: string; signal: "MTF Pullback"; score: number; entryTime: number; exitTime: number;
  date: string; exitDate: string; entry: number; stop: number; target: number; resultR: number;
  outcome: "WIN" | "LOSS" | "TIME"; holdBars: number;
};

type Funnel = { structureReady: number; mtfAligned: number; scorePassed: number };

const FEE_RATE = 0.0015;
const HOLDING_BARS = 20;

const marketMeta: Record<MarketUniverseKey, { label: string; assetLabel: string; timeZone: string }> = {
  thai: { label: "หุ้นไทย", assetLabel: "หุ้น", timeZone: "Asia/Bangkok" },
  global: { label: "หุ้นโลก", assetLabel: "หุ้น", timeZone: "America/New_York" },
  etf: { label: "ETF / กองทุน", assetLabel: "กองทุน", timeZone: "America/New_York" },
  crypto: { label: "คริปโต", assetLabel: "เหรียญ", timeZone: "UTC" },
};

function resolveMarket(value: string | null): MarketUniverseKey {
  return value === "global" || value === "etf" || value === "crypto" ? value : "thai";
}

function marketDate(time: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(time * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function simulateTrade(symbol: string, score: number, candles: Candle[], signalIndex: number, currentAtr: number, timeZone: string): Trade | null {
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
  const resultR = Math.round((rawR - entry * FEE_RATE / risk) * 100) / 100;
  if (outcome === "TIME") outcome = resultR > 0 ? "WIN" : "LOSS";
  return {
    symbol, signal: "MTF Pullback", score, entryTime: entryCandle.time, exitTime: candles[exitIndex].time,
    date: marketDate(entryCandle.time, timeZone), exitDate: marketDate(candles[exitIndex].time, timeZone),
    entry, stop, target, resultR, outcome, holdBars: exitIndex - entryIndex + 1,
  };
}

function generateCandidates(symbol: string, name: string, sector: string, hourly: Candle[], daily: Candle[], cutoff: number, timeZone: string) {
  const candidates: Trade[] = [];
  const funnel: Funnel = { structureReady: 0, mtfAligned: 0, scorePassed: 0 };
  let wasReady = false;

  for (let index = 120; index < hourly.length - 1; index += 1) {
    const time = hourly[index].time;
    const h1Candles = hourly.slice(0, index + 1);
    const structure = detectStructure(h1Candles);
    const isFreshReady = structure.stage === "ENTRY_READY" && !wasReady;
    wasReady = structure.stage === "ENTRY_READY";
    if (!isFreshReady || time < cutoff) continue;
    funnel.structureReady += 1;

    const currentDay = marketDate(time, timeZone);
    const d1Candles = daily.filter((candle) => marketDate(candle.time, timeZone) < currentDay);
    const h4Candles = resampleFourHour(h1Candles);
    if (d1Candles.length < 55 || h4Candles.length < 55 || h1Candles.length < 55) continue;
    const d1 = analyze(symbol, name, sector, d1Candles);
    const h4 = analyze(symbol, name, sector, h4Candles);
    const h1 = analyze(symbol, name, sector, h1Candles);
    const aligned = d1.bias === "BULLISH" && h4.bias === "BULLISH" && h1.bias === "BULLISH";
    if (!aligned) continue;
    funnel.mtfAligned += 1;

    const trendScore = Math.round(d1.trendScore * .45 + h4.trendScore * .35 + h1.trendScore * .2);
    const entryScore = structureEntryScore(structure, h1.rsi, h1.volume);
    const score = Math.round(trendScore * .6 + entryScore * .4);
    const trade = simulateTrade(symbol, score, hourly, index, h1.atr, timeZone);
    if (trade) candidates.push(trade);
  }
  return { candidates, funnel };
}

function selectPortfolio(candidates: Trade[], minScore: number) {
  const eligible = candidates.filter((trade) => trade.score >= minScore);
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
  const market = resolveMarket(params.get("market"));
  const meta = marketMeta[market];
  const instruments = marketUniverses[market];
  const months = [3, 6, 12].includes(Number(params.get("months"))) ? Number(params.get("months")) : 12;
  const minScore = [60, 70, 80].includes(Number(params.get("score"))) ? Number(params.get("score")) : 70;
  const cutoff = Math.floor(Date.now() / 1000) - months * 30.4375 * 86400;
  try {
    const settled = await Promise.allSettled(instruments.map(async ([symbol, ticker, name, sector]) => {
      const [hourly, daily] = await Promise.all([
        fetchChart(ticker, "60m", "1y", 3600),
        fetchChart(ticker, "1d", "2y", 3600),
      ]);
      if (hourly.length < 180 || daily.length < 120) throw new Error("insufficient MTF history");
      return generateCandidates(symbol, name, sector, hourly, daily, cutoff, meta.timeZone);
    }));
    const results = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    if (results.length < Math.min(5, instruments.length)) throw new Error(`ผู้ให้บริการข้อมูลตอบกลับไม่เพียงพอสำหรับ Backtest ${meta.label}`);
    const candidates = results.flatMap((item) => item.candidates);
    const funnel = results.reduce((sum, item) => ({
      structureReady: sum.structureReady + item.funnel.structureReady,
      mtfAligned: sum.mtfAligned + item.funnel.mtfAligned,
      scorePassed: 0,
    }), { structureReady: 0, mtfAligned: 0, scorePassed: 0 });
    funnel.scorePassed = candidates.filter((trade) => trade.score >= minScore).length;
    const trades = selectPortfolio(candidates, minScore);
    const comparisons = [60, 70, 80].map((score) => ({ score, ...metrics(selectPortfolio(candidates, score)) }));
    return Response.json({
      market: { key: market, label: meta.label, assetLabel: meta.assetLabel },
      assumptions: { months, timeframe: "D1 / H4 / H1", minScore, rr: 2, atrStop: 1.2, maxTradesPerDay: 2, holdingBars: HOLDING_BARS, feeRate: FEE_RATE, entry: "next_h1_open", sameBarRule: "stop_first", structure: "CHoCH → BOS → Pullback" },
      coverage: { requested: instruments.length, succeeded: results.length }, funnel,
      metrics: metrics(trades), comparisons, bySignal: groupMetrics(trades, "signal"), byStock: groupMetrics(trades, "symbol").slice(0, 10),
      recentTrades: trades.slice(-12).reverse(), source: "Yahoo Finance 60m + daily · reference only", generatedAt: Date.now(),
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "MTF Backtest ไม่สำเร็จ" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
