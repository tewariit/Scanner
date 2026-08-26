export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Signal = "Breakout" | "Pullback" | "Momentum" | "Watch";
export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type StructureStage = "ENTRY_READY" | "BOS_CONFIRMED" | "CHOCH_DETECTED" | "WAIT_STRUCTURE" | "BEARISH_STRUCTURE";

export const universe = [
  ["ADVANC", "แอดวานซ์ อินโฟร์ เซอร์วิส", "เทคโนโลยี"], ["AOT", "ท่าอากาศยานไทย", "ขนส่ง"],
  ["BDMS", "กรุงเทพดุสิตเวชการ", "การแพทย์"], ["BH", "โรงพยาบาลบำรุงราษฎร์", "การแพทย์"],
  ["CPALL", "ซีพี ออลล์", "พาณิชย์"], ["CPF", "เจริญโภคภัณฑ์อาหาร", "อาหาร"],
  ["DELTA", "เดลต้า อีเลคโทรนิคส์", "อิเล็กทรอนิกส์"], ["EA", "พลังงานบริสุทธิ์", "พลังงาน"],
  ["GULF", "กัลฟ์ ดีเวลลอปเมนท์", "พลังงาน"], ["KBANK", "ธนาคารกสิกรไทย", "ธนาคาร"],
  ["KTB", "ธนาคารกรุงไทย", "ธนาคาร"], ["MINT", "ไมเนอร์ อินเตอร์เนชั่นแนล", "อาหารและท่องเที่ยว"],
  ["PTT", "ปตท.", "พลังงาน"], ["PTTEP", "ปตท. สำรวจและผลิตปิโตรเลียม", "พลังงาน"],
  ["SCB", "เอสซีบี เอกซ์", "ธนาคาร"], ["TOP", "ไทยออยล์", "พลังงาน"],
  ["TRUE", "ทรู คอร์ปอเรชั่น", "เทคโนโลยี"],
] as const;

export function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  return values.reduce((acc, value, index) => index === 0 ? value : value * k + acc * (1 - k), values[0]);
}

export function rsi(values: number[], period = 14) {
  const tail = values.slice(-period - 1);
  const changes = tail.slice(1).map((value, index) => value - tail[index]);
  const gains = changes.reduce((sum, value) => sum + Math.max(0, value), 0) / period;
  const losses = changes.reduce((sum, value) => sum + Math.max(0, -value), 0) / period;
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}

export function atr(candles: Candle[], period = 14) {
  const tail = candles.slice(-period - 1);
  const trueRanges = tail.slice(1).map((candle, index) => Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - tail[index].close),
    Math.abs(candle.low - tail[index].close),
  ));
  return trueRanges.reduce((sum, value) => sum + value, 0) / Math.max(1, trueRanges.length);
}

export function detectStructure(candles: Candle[]) {
  const window = candles.slice(-120);
  const swingsHigh: Array<{ index: number; price: number; time: number }> = [];
  const swingsLow: Array<{ index: number; price: number; time: number }> = [];
  const events: Array<{ index: number; kind: "CHOCH" | "BOS"; direction: "BULLISH" | "BEARISH"; level: number }> = [];
  let bias: Bias = "NEUTRAL";
  let brokenHigh = -1;
  let brokenLow = -1;

  for (let index = 4; index < window.length; index++) {
    const pivotIndex = index - 2;
    const pivot = window[pivotIndex];
    const neighborhood = window.slice(pivotIndex - 2, pivotIndex + 3);
    const isHigh = neighborhood.every((candle, offset) => offset === 2 || pivot.high > candle.high);
    const isLow = neighborhood.every((candle, offset) => offset === 2 || pivot.low < candle.low);
    if (isHigh) swingsHigh.push({ index: pivotIndex, price: pivot.high, time: pivot.time });
    if (isLow) swingsLow.push({ index: pivotIndex, price: pivot.low, time: pivot.time });

    const highPair = swingsHigh.slice(-2);
    const lowPair = swingsLow.slice(-2);
    if (highPair.length === 2 && lowPair.length === 2) {
      if (highPair[1].price > highPair[0].price && lowPair[1].price > lowPair[0].price) bias = "BULLISH";
      else if (highPair[1].price < highPair[0].price && lowPair[1].price < lowPair[0].price) bias = "BEARISH";
    }

    const lastHigh = swingsHigh.at(-1);
    const lastLow = swingsLow.at(-1);
    if (lastHigh && lastHigh.index !== brokenHigh && window[index].close > lastHigh.price) {
      events.push({ index, kind: bias === "BEARISH" ? "CHOCH" : "BOS", direction: "BULLISH", level: lastHigh.price });
      bias = "BULLISH";
      brokenHigh = lastHigh.index;
    }
    if (lastLow && lastLow.index !== brokenLow && window[index].close < lastLow.price) {
      events.push({ index, kind: bias === "BULLISH" ? "CHOCH" : "BOS", direction: "BEARISH", level: lastLow.price });
      bias = "BEARISH";
      brokenLow = lastLow.index;
    }
  }

  const latestBullChoch = [...events].reverse().find((event) => event.kind === "CHOCH" && event.direction === "BULLISH");
  const latestBearEvent = [...events].reverse().find((event) => event.direction === "BEARISH");
  const activeChoch = latestBullChoch && (!latestBearEvent || latestBearEvent.index < latestBullChoch.index) ? latestBullChoch : undefined;
  const activeBos = activeChoch ? events.find((event) => event.index > activeChoch.index && event.kind === "BOS" && event.direction === "BULLISH") : undefined;
  const currentAtr = atr(window);
  const current = window.at(-1)!;
  let pullbackIndex = -1;
  if (activeBos) {
    for (let index = activeBos.index + 1; index < window.length; index++) {
      const candle = window[index];
      if (candle.low <= activeBos.level + currentAtr * .25 && candle.close >= activeBos.level - currentAtr * .15) pullbackIndex = index;
    }
  }
  const pullback = Boolean(activeBos && pullbackIndex >= 0 && window.length - 1 - pullbackIndex <= 3 && current.close <= activeBos.level + currentAtr * .65);
  const highPair = swingsHigh.slice(-2);
  const lowPair = swingsLow.slice(-2);
  const label = highPair.length === 2 && lowPair.length === 2
    ? highPair[1].price > highPair[0].price && lowPair[1].price > lowPair[0].price ? "HH / HL"
      : highPair[1].price < highPair[0].price && lowPair[1].price < lowPair[0].price ? "LH / LL" : "MIXED"
    : "FORMING";
  const stage: StructureStage = activeChoch && activeBos && pullback ? "ENTRY_READY"
    : activeChoch && activeBos ? "BOS_CONFIRMED"
      : activeChoch ? "CHOCH_DETECTED"
        : bias === "BEARISH" ? "BEARISH_STRUCTURE" : "WAIT_STRUCTURE";

  return {
    direction: bias,
    label,
    stage,
    choch: Boolean(activeChoch),
    bos: Boolean(activeBos),
    pullback,
    breakLevel: activeBos?.level ?? activeChoch?.level ?? null,
    lastSwingHigh: swingsHigh.at(-1)?.price ?? null,
    lastSwingLow: swingsLow.at(-1)?.price ?? null,
    barsSinceEvent: activeBos ? window.length - 1 - activeBos.index : activeChoch ? window.length - 1 - activeChoch.index : null,
  };
}

export function structureEntryScore(structure: ReturnType<typeof detectStructure>, rsiValue: number, volumeRatio: number) {
  return Math.min(100,
    (structure.choch ? 25 : 0) +
    (structure.bos ? 30 : 0) +
    (structure.pullback ? 30 : 0) +
    (rsiValue >= 50 && rsiValue <= 70 ? 10 : 0) +
    (volumeRatio >= 1 ? 5 : 0));
}

export function analyze(symbol: string, name: string, sector: string, candles: Candle[]) {
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const current = candles.at(-1)!;
  const previous = candles.at(-2)!;
  const currentEma20 = ema(closes.slice(-55), 20);
  const currentEma50 = ema(closes.slice(-80), 50);
  const priorEma20 = ema(closes.slice(-60, -5), 20);
  const currentRsi = rsi(closes);
  const volumeWindow = volumes.slice(-21, -1);
  const avgVolume = volumeWindow.reduce((sum, value) => sum + value, 0) / Math.max(1, volumeWindow.length);
  const volumeRatio = current.volume / Math.max(1, avgVolume);
  const priorHigh = Math.max(...candles.slice(-21, -1).map((candle) => candle.high));
  const recentMomentum = (current.close / closes.at(-4)! - 1) * 100;
  const change = (current.close / previous.close - 1) * 100;
  const uptrend = current.close > currentEma20 && currentEma20 > currentEma50;
  const downtrend = current.close < currentEma20 && currentEma20 < currentEma50;
  const bias: Bias = uptrend ? "BULLISH" : downtrend ? "BEARISH" : "NEUTRAL";
  const nearEma20 = Math.abs(current.close - currentEma20) / currentEma20 <= 0.025;
  const breakout = current.close >= priorHigh * 0.997;

  let trendScore = 0;
  if (current.close > currentEma20) trendScore += 35;
  if (currentEma20 > currentEma50) trendScore += 35;
  if (currentEma20 > priorEma20) trendScore += 30;

  let entryScore = 0;
  if (currentRsi >= 50 && currentRsi <= 70) entryScore += 30;
  else if (currentRsi >= 45 && currentRsi <= 75) entryScore += 15;
  if (volumeRatio >= 1.5) entryScore += 30;
  else if (volumeRatio >= 1) entryScore += 15;
  if (breakout) entryScore += 25;
  else if (nearEma20 && uptrend) entryScore += 20;
  if (recentMomentum > 1.5) entryScore += 15;

  let signal: Signal = "Watch";
  if (uptrend && breakout) signal = "Breakout";
  else if (uptrend && nearEma20) signal = "Pullback";
  else if (current.close > currentEma20 && currentRsi > 55 && recentMomentum > 1.5) signal = "Momentum";

  const score = Math.round(trendScore * 0.55 + Math.min(100, entryScore) * 0.45);
  const state = !uptrend && current.close < currentEma50 ? "NO_TRADE" : score >= 75 && signal !== "Watch" ? "TRADE" : "WAIT";
  const currentAtr = atr(candles);
  return {
    symbol, name, sector, price: current.close, change, score, trendScore, entryScore: Math.min(100, entryScore), signal, state,
    rsi: Math.round(currentRsi), volume: volumeRatio, bias, trend: uptrend ? "ขาขึ้น" : current.close > currentEma20 ? "ฟื้นตัว" : "อ่อนตัว",
    target: current.close + currentAtr * 2, stop: current.close - currentAtr * 1.2, atr: currentAtr,
    reasons: [current.close > currentEma20 ? "ราคาเหนือ EMA20" : "ราคาต่ำกว่า EMA20", currentEma20 > currentEma50 ? "EMA20 เหนือ EMA50" : "EMA20 ยังต่ำกว่า EMA50", volumeRatio >= 1.5 ? `Volume ยืนยัน ${volumeRatio.toFixed(1)}x` : `Volume ${volumeRatio.toFixed(1)}x ยังไม่เด่น`],
    timestamp: current.time,
    candles: candles.slice(-70).map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume })),
  };
}

export function resampleFourHour(candles: Candle[]) {
  const sessions = new Map<string, Candle[]>();
  for (const candle of candles) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(candle.time * 1000));
    sessions.set(date, [...(sessions.get(date) ?? []), candle]);
  }
  return [...sessions.values()].flatMap((session) => {
    const ordered = session.sort((a, b) => a.time - b.time);
    const groups: Candle[][] = [];
    for (let index = 0; index < ordered.length; index += 4) groups.push(ordered.slice(index, index + 4));
    return groups.map((group) => ({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group.at(-1)!.close,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0),
    }));
  }).sort((a, b) => a.time - b.time);
}

export async function fetchChart(ticker: string, interval: string, range: string, cacheTtl = 60) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&events=div%2Csplits`;
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cf: { cacheTtl } } as RequestInit & { cf: { cacheTtl: number } });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const json = await response.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> } };
    const result = json.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp || !quote) throw new Error("missing chart data");
    return result.timestamp.flatMap((time, index) => {
      const open = quote.open?.[index], high = quote.high?.[index], low = quote.low?.[index], close = quote.close?.[index], volume = quote.volume?.[index];
      return open == null || high == null || low == null || close == null ? [] : [{ time, open, high, low, close, volume: volume ?? 0 }];
    });
  } finally { clearTimeout(timer); }
}
