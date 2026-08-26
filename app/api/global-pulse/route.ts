import { ema, fetchChart } from "@/lib/technical-engine";

const pulseAssets = [
  ["sp500", "^GSPC", "S&P 500", "หุ้นสหรัฐฯ"],
  ["vix", "^VIX", "VIX", "ความกลัว"],
  ["dxy", "DX-Y.NYB", "DXY", "ดอลลาร์"],
  ["usdthb", "THB=X", "USD/THB", "เงินบาท"],
  ["oil", "CL=F", "WTI", "น้ำมัน"],
  ["gold", "GC=F", "Gold", "ทองคำ"],
  ["us10y", "^TNX", "US 10Y", "Bond yield"],
  ["hangseng", "^HSI", "Hang Seng", "จีน/ฮ่องกง"],
] as const;

export async function GET() {
  try {
    const settled = await Promise.allSettled(pulseAssets.map(async ([key, ticker, label, group]) => {
      const candles = await fetchChart(ticker, "1d", "3mo", 120);
      if (candles.length < 25) throw new Error("insufficient history");
      const closes = candles.map((candle) => candle.close);
      const current = closes.at(-1)!;
      const previous = closes.at(-2)!;
      const fiveDaysAgo = closes.at(-6) ?? previous;
      const ema20 = ema(closes.slice(-40), 20);
      return {
        key, ticker, label, group, value: current,
        change: (current / previous - 1) * 100,
        change5d: (current / fiveDaysAgo - 1) * 100,
        aboveEma20: current >= ema20,
      };
    }));
    const assets = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    if (assets.length < 5) throw new Error("ข้อมูล Global Pulse ไม่เพียงพอ");
    const byKey = Object.fromEntries(assets.map((asset) => [asset.key, asset]));
    let points = 50;
    if (byKey.sp500) points += (byKey.sp500.aboveEma20 ? 10 : -10) + (byKey.sp500.change5d >= 0 ? 5 : -5);
    if (byKey.vix) points += (!byKey.vix.aboveEma20 ? 10 : -10) + (byKey.vix.change5d <= 0 ? 5 : -5);
    if (byKey.dxy) points += byKey.dxy.change5d <= 1 ? 4 : -4;
    if (byKey.us10y) points += byKey.us10y.change5d <= 2 ? 4 : -4;
    if (byKey.hangseng) points += byKey.hangseng.aboveEma20 ? 7 : -7;
    const score = Math.max(0, Math.min(100, points));
    const regime = score >= 65 ? "RISK_ON" : score <= 40 ? "RISK_OFF" : "NEUTRAL";
    const baht = byKey.usdthb?.change5d == null ? "UNKNOWN" : byKey.usdthb.change5d > .5 ? "WEAKENING" : byKey.usdthb.change5d < -.5 ? "STRENGTHENING" : "STABLE";
    const commodities = ((byKey.oil?.aboveEma20 ? 1 : -1) + (byKey.gold?.aboveEma20 ? 1 : -1)) > 0 ? "POSITIVE" : "MIXED";
    return Response.json({
      assets, score, regime, baht, commodities,
      summary: regime === "RISK_ON" ? "สภาพแวดล้อมโลกสนับสนุนสินทรัพย์เสี่ยง"
        : regime === "RISK_OFF" ? "ความเสี่ยงโลกสูง — สัญญาณ TRADE จะถูกลดเป็น WAIT"
          : "ภาพรวมโลกผสม — ให้น้ำหนักกับสัญญาณเทคนิคเป็นหลัก",
      generatedAt: Date.now(),
    }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=180" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลด Global Pulse ไม่สำเร็จ" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
