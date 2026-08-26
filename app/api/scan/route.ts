import { analyze, fetchChart, resampleFourHour, universe } from "@/lib/technical-engine";

const intervalConfig = {
  day: { interval: "1d", range: "6mo", minBars: 55 },
  hour: { interval: "60m", range: "1mo", minBars: 55 },
  "15m": { interval: "15m", range: "5d", minBars: 55 },
} as const;

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("timeframe");
  if (requested === "multi") return multiTimeframeScan();
  const timeframe = requested as keyof typeof intervalConfig | null;
  const key = timeframe && timeframe in intervalConfig ? timeframe : "day";
  const config = intervalConfig[key];
  try {
    const settled = await Promise.allSettled(universe.map(async ([symbol, name, sector]) => {
      const candles = await fetchChart(`${symbol}.BK`, config.interval, config.range);
      if (candles.length < config.minBars) throw new Error("insufficient history");
      return analyze(symbol, name, sector, candles);
    }));
    const stocks = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []).sort((a, b) => b.score - a.score);
    if (stocks.length < 5) throw new Error("ผู้ให้บริการข้อมูลตอบกลับไม่เพียงพอ");
    let market = null;
    try {
      const setCandles = await fetchChart("^SET.BK", config.interval, config.range);
      const last = setCandles.at(-1), previous = setCandles.at(-2);
      if (last && previous) market = { price: last.close, change: (last.close / previous.close - 1) * 100 };
    } catch { /* หุ้นยังใช้ได้แม้ดัชนีขัดข้อง */ }
    return Response.json({ stocks, market, scanned: universe.length, succeeded: stocks.length, source: "Yahoo Finance · delayed quote", timeframe: key, generatedAt: Date.now() }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลได้";
    return Response.json({ error: message, source: "Yahoo Finance" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

async function multiTimeframeScan() {
  try {
    const settled = await Promise.allSettled(universe.map(async ([symbol, name, sector]) => {
      const [dailyCandles, hourlyCandles] = await Promise.all([
        fetchChart(`${symbol}.BK`, "1d", "6mo", 90),
        fetchChart(`${symbol}.BK`, "60m", "3mo", 90),
      ]);
      const fourHourCandles = resampleFourHour(hourlyCandles);
      if (dailyCandles.length < 55 || hourlyCandles.length < 55 || fourHourCandles.length < 55) throw new Error("insufficient MTF history");

      const d1 = analyze(symbol, name, sector, dailyCandles);
      const h4 = analyze(symbol, name, sector, fourHourCandles);
      const h1 = analyze(symbol, name, sector, hourlyCandles);
      const conflict = (d1.bias === "BULLISH" && (h4.bias === "BEARISH" || h1.bias === "BEARISH")) ||
        (d1.bias === "BEARISH" && (h4.bias === "BULLISH" || h1.bias === "BULLISH"));
      const aligned = d1.bias === "BULLISH" && h4.bias === "BULLISH" && h1.bias === "BULLISH";
      const trendScore = Math.round(d1.trendScore * .45 + h4.trendScore * .35 + h1.trendScore * .2);
      const entryScore = h1.entryScore;
      const score = Math.round(trendScore * .65 + entryScore * .35);
      const state = conflict ? "WAIT" : aligned && h1.signal !== "Watch" && score >= 70 ? "TRADE" : d1.bias === "BEARISH" && h4.bias === "BEARISH" ? "NO_TRADE" : "WAIT";
      const summary = conflict ? "โครงสร้างต่างกรอบขัดกัน — รอให้ H4/H1 กลับมาไปทางเดียวกับ D1" : aligned ? "D1, H4 และ H1 อยู่ฝั่งขาขึ้นเดียวกัน" : state === "NO_TRADE" ? "D1 และ H4 เป็นขาลง — ยังไม่มี Long edge" : "แนวโน้มยังไม่ครบ 3 กรอบ — รอการยืนยัน";

      return {
        ...h1,
        score,
        trendScore,
        entryScore,
        state,
        trend: aligned ? "MTF ขาขึ้น" : conflict ? "กรอบเวลาขัดกัน" : state === "NO_TRADE" ? "MTF ขาลง" : "รอ MTF ยืนยัน",
        reasons: [summary, `D1 ${d1.bias} · H4 ${h4.bias} · H1 ${h1.bias}`, ...h1.reasons],
        mtf: {
          d1: { bias: d1.bias, score: d1.trendScore },
          h4: { bias: h4.bias, score: h4.trendScore },
          h1: { bias: h1.bias, score: h1.trendScore },
          aligned,
          conflict,
          summary,
          note: "H4 สังเคราะห์จากแท่งราคา 60 นาที",
        },
      };
    }));
    const stocks = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []).sort((a, b) => b.score - a.score);
    if (stocks.length < 5) throw new Error("ผู้ให้บริการข้อมูลตอบกลับไม่เพียงพอสำหรับ MTF");
    let market = null;
    try {
      const setCandles = await fetchChart("^SET.BK", "1d", "6mo");
      const last = setCandles.at(-1), previous = setCandles.at(-2);
      if (last && previous) market = { price: last.close, change: (last.close / previous.close - 1) * 100 };
    } catch { /* หุ้นยังใช้ได้แม้ดัชนีขัดข้อง */ }
    return Response.json({ stocks, market, scanned: universe.length, succeeded: stocks.length, source: "Yahoo Finance · MTF delayed quote", timeframe: "multi", generatedAt: Date.now() }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=90" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูล MTF ได้";
    return Response.json({ error: message, source: "Yahoo Finance" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
