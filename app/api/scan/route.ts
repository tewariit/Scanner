import {
  analyze,
  detectStructure,
  dividendUniverses,
  fetchChart,
  fetchChartData,
  marketUniverses,
  resampleFourHour,
  structureEntryScore,
  type MarketUniverseKey,
} from "@/lib/technical-engine";
import { thaiAllUniverse } from "@/lib/thai-universe";

type UniverseTheme = "core" | "dividend";

const intervalConfig = {
  day: { interval: "1d", range: "6mo", minBars: 55 },
  hour: { interval: "60m", range: "1mo", minBars: 55 },
  "15m": { interval: "15m", range: "5d", minBars: 55 },
} as const;

const marketMeta = {
  thai: { label: "หุ้นไทย", benchmark: "^SET.BK", benchmarkLabel: "SET Index", currency: "THB", timeZone: "Asia/Bangkok", hours: "จ.–ศ. 10:00–16:30" },
  global: { label: "หุ้นโลก", benchmark: "^GSPC", benchmarkLabel: "S&P 500", currency: "USD", timeZone: "America/New_York", hours: "จ.–ศ. ตามเวลาตลาดสหรัฐฯ" },
  etf: { label: "ETF โลก", benchmark: "SPY", benchmarkLabel: "S&P 500 ETF", currency: "USD", timeZone: "America/New_York", hours: "จ.–ศ. ตามเวลาตลาดสหรัฐฯ" },
  crypto: { label: "คริปโต", benchmark: "BTC-USD", benchmarkLabel: "Bitcoin", currency: "USD", timeZone: "UTC", hours: "เปิดตลอด 24/7" },
} satisfies Record<MarketUniverseKey, { label: string; benchmark: string; benchmarkLabel: string; currency: string; timeZone: string; hours: string }>;

function requestedMarket(request: Request): MarketUniverseKey {
  const value = new URL(request.url).searchParams.get("market");
  return value === "global" || value === "etf" || value === "crypto" ? value : "thai";
}

function requestedTheme(url: URL, marketKey: MarketUniverseKey): UniverseTheme {
  return url.searchParams.get("theme") === "dividend" && marketKey !== "crypto" ? "dividend" : "core";
}

function instrumentsFor(marketKey: MarketUniverseKey, theme: UniverseTheme) {
  return theme === "dividend" && marketKey !== "crypto" ? dividendUniverses[marketKey] : marketUniverses[marketKey];
}

function requestedUniverse(url: URL, marketKey: MarketUniverseKey, theme: UniverseTheme) {
  if (marketKey !== "thai" || theme !== "core" || url.searchParams.get("universe") !== "all") return instrumentsFor(marketKey, theme);
  const query = (url.searchParams.get("q") ?? "").trim().toUpperCase();
  const matches = query ? thaiAllUniverse.filter(([symbol, , name]) => `${symbol} ${name}`.toUpperCase().includes(query)) : thaiAllUniverse;
  const batchSize = Math.min(24, Math.max(6, Number(url.searchParams.get("batchSize")) || 18));
  const totalBatches = Math.max(1, Math.ceil(matches.length / batchSize));
  const batch = Math.min(totalBatches - 1, Math.max(0, Number(url.searchParams.get("batch")) || 0));
  return { instruments: matches.slice(batch * batchSize, (batch + 1) * batchSize), total: matches.length, batch, totalBatches, batchSize };
}

function universePage(url: URL, marketKey: MarketUniverseKey, theme: UniverseTheme) {
  const requested = requestedUniverse(url, marketKey, theme);
  if (Array.isArray(requested)) return { instruments: requested, total: requested.length, batch: 0, totalBatches: 1, batchSize: requested.length };
  return requested;
}

async function dividendData(ticker: string, enabled: boolean) {
  if (!enabled) return { annualDividend: 0 };
  return fetchChartData(ticker, "1d", "1y", 300);
}

async function benchmarkQuote(ticker: string, interval: string, range: string) {
  try {
    const candles = await fetchChart(ticker, interval, range);
    const last = candles.at(-1), previous = candles.at(-2);
    return last && previous ? { price: last.close, change: (last.close / previous.close - 1) * 100 } : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const marketKey = requestedMarket(request);
  const theme = requestedTheme(url, marketKey);
  const requested = url.searchParams.get("timeframe");
  if (requested === "multi") return multiTimeframeScan(marketKey, theme, url);
  const timeframe = requested as keyof typeof intervalConfig | null;
  const key = timeframe && timeframe in intervalConfig ? timeframe : "day";
  const config = intervalConfig[key];
  const page = universePage(url, marketKey, theme);
  const instruments = page.instruments;
  const meta = marketMeta[marketKey];

  try {
    const settled = await Promise.allSettled(instruments.map(async ([symbol, ticker, name, sector]) => {
      const [candles, dividend] = await Promise.all([
        fetchChart(ticker, config.interval, config.range),
        dividendData(ticker, theme === "dividend"),
      ]);
      if (candles.length < config.minBars) throw new Error("insufficient history");
      const result = analyze(symbol, name, sector, candles);
      return {
        ...result, marketKey, currency: meta.currency,
        annualDividend: dividend.annualDividend,
        dividendYield: dividend.annualDividend > 0 ? dividend.annualDividend / result.price * 100 : 0,
      };
    }));
    const stocks = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []).sort((a, b) => b.score - a.score);
    if (stocks.length < Math.min(url.searchParams.get("q") ? 1 : 5, instruments.length)) throw new Error("ผู้ให้บริการข้อมูลตอบกลับไม่เพียงพอ");
    const market = await benchmarkQuote(meta.benchmark, config.interval, config.range);
    return Response.json({
      stocks, market, marketMeta: { ...meta, label: theme === "dividend" ? `${meta.label}ปันผล` : meta.label }, scanned: instruments.length, succeeded: stocks.length,
      universe: { total: page.total, batch: page.batch, totalBatches: page.totalBatches, batchSize: page.batchSize },
      source: theme === "dividend" ? "Yahoo Finance · ราคาและเงินปันผลย้อนหลัง 12 เดือน" : marketKey === "crypto" ? "Yahoo Finance · ตลาดคริปโต 24/7" : "Yahoo Finance · delayed quote",
      timeframe: key, theme, generatedAt: Date.now(),
    }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=1800" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลได้";
    return Response.json({ error: message, source: "Yahoo Finance" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

async function multiTimeframeScan(marketKey: MarketUniverseKey, theme: UniverseTheme, url: URL) {
  const page = universePage(url, marketKey, theme);
  const instruments = page.instruments;
  const meta = marketMeta[marketKey];
  try {
    const settled = await Promise.allSettled(instruments.map(async ([symbol, ticker, name, sector]) => {
      const [dailyCandles, hourlyCandles, dividend] = await Promise.all([
        fetchChart(ticker, "1d", "6mo", 90),
        fetchChart(ticker, "60m", "3mo", 90),
        dividendData(ticker, theme === "dividend"),
      ]);
      const fourHourCandles = resampleFourHour(hourlyCandles, meta.timeZone);
      if (dailyCandles.length < 55 || hourlyCandles.length < 55 || fourHourCandles.length < 55) throw new Error("insufficient MTF history");

      const d1 = analyze(symbol, name, sector, dailyCandles);
      const h4 = analyze(symbol, name, sector, fourHourCandles);
      const h1 = analyze(symbol, name, sector, hourlyCandles);
      const structure = detectStructure(hourlyCandles);
      const conflict = (d1.bias === "BULLISH" && (h4.bias === "BEARISH" || h1.bias === "BEARISH")) ||
        (d1.bias === "BEARISH" && (h4.bias === "BULLISH" || h1.bias === "BULLISH"));
      const aligned = d1.bias === "BULLISH" && h4.bias === "BULLISH" && h1.bias === "BULLISH";
      const trendScore = Math.round(d1.trendScore * .45 + h4.trendScore * .35 + h1.trendScore * .2);
      const entryScore = structureEntryScore(structure, h1.rsi, h1.volume);
      const score = Math.round(trendScore * .6 + entryScore * .4);
      const state = conflict ? "WAIT" : aligned && structure.stage === "ENTRY_READY" && score >= 70 ? "TRADE" : d1.bias === "BEARISH" && h4.bias === "BEARISH" ? "NO_TRADE" : "WAIT";
      const summary = conflict ? "โครงสร้างต่างกรอบขัดกัน — รอให้ H4/H1 กลับมาไปทางเดียวกับ D1" : aligned ? "D1, H4 และ H1 อยู่ฝั่งขาขึ้นเดียวกัน" : state === "NO_TRADE" ? "D1 และ H4 เป็นขาลง — ยังไม่มี Long edge" : "แนวโน้มยังไม่ครบ 3 กรอบ — รอการยืนยัน";
      const structureSummary = structure.stage === "ENTRY_READY" ? "ครบ CHoCH → BOS → Pullback ใกล้ระดับ Break"
        : structure.stage === "BOS_CONFIRMED" ? "ยืนยัน BOS แล้ว — รอราคาย่อกลับหา Break level"
          : structure.stage === "CHOCH_DETECTED" ? "พบ CHoCH — รอ BOS ยืนยันโครงสร้างใหม่"
            : structure.stage === "BEARISH_STRUCTURE" ? "H1 ยังเป็นโครงสร้าง LH / LL" : "ยังไม่พบลำดับโครงสร้างสำหรับเข้า Long";

      return {
        ...h1, marketKey, currency: meta.currency, score, trendScore, entryScore, state,
        annualDividend: dividend.annualDividend,
        dividendYield: dividend.annualDividend > 0 ? dividend.annualDividend / h1.price * 100 : 0,
        signal: structure.stage === "ENTRY_READY" ? "Pullback" : structure.stage === "BOS_CONFIRMED" ? "Breakout" : h1.signal,
        trend: aligned ? "MTF ขาขึ้น" : conflict ? "กรอบเวลาขัดกัน" : state === "NO_TRADE" ? "MTF ขาลง" : "รอ MTF ยืนยัน",
        reasons: [summary, structureSummary, `D1 ${d1.bias} · H4 ${h4.bias} · H1 ${h1.bias}`, ...h1.reasons],
        structure: { ...structure, summary: structureSummary },
        mtf: {
          d1: { bias: d1.bias, score: d1.trendScore }, h4: { bias: h4.bias, score: h4.trendScore }, h1: { bias: h1.bias, score: h1.trendScore },
          aligned, conflict, summary, note: "H4 สังเคราะห์จากแท่งราคา 60 นาที",
        },
      };
    }));
    const stocks = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []).sort((a, b) => b.score - a.score);
    if (stocks.length < Math.min(url.searchParams.get("q") ? 1 : 5, instruments.length)) throw new Error("ผู้ให้บริการข้อมูลตอบกลับไม่เพียงพอสำหรับ MTF");
    const market = await benchmarkQuote(meta.benchmark, "1d", "6mo");
    return Response.json({
      stocks, market, marketMeta: { ...meta, label: theme === "dividend" ? `${meta.label}ปันผล` : meta.label }, scanned: instruments.length, succeeded: stocks.length,
      universe: { total: page.total, batch: page.batch, totalBatches: page.totalBatches, batchSize: page.batchSize },
      source: theme === "dividend" ? "Yahoo Finance · MTF และเงินปันผลย้อนหลัง 12 เดือน" : marketKey === "crypto" ? "Yahoo Finance · Crypto MTF 24/7" : "Yahoo Finance · MTF delayed quote",
      timeframe: "multi", theme, generatedAt: Date.now(),
    }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=1800" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูล MTF ได้";
    return Response.json({ error: message, source: "Yahoo Finance" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
