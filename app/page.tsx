"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Bitcoin, CandlestickChart, ChevronRight, Clock3, Coins,
  Gauge, Globe2, LayoutDashboard, ListFilter, Radar, RefreshCw, Search, Settings,
  Star, Target, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BacktestLab } from "@/components/backtest-lab";
import { TradingChart } from "@/components/trading-chart";

type MarketKey = "thai" | "global" | "etf" | "crypto";
type TradeState = "TRADE" | "WAIT" | "NO_TRADE";
type Stock = {
  symbol: string; name: string; sector: string; price: number; change: number;
  score: number; signal: "Breakout" | "Pullback" | "Momentum" | "Watch"; rsi: number;
  volume: number; trend: string; target: number; stop: number; seed?: number;
  trendScore?: number; entryScore?: number; state?: TradeState; currency?: string; marketKey?: MarketKey;
  reasons?: string[]; timestamp?: number;
  mtf?: {
    d1: { bias: "BULLISH" | "BEARISH" | "NEUTRAL"; score: number };
    h4: { bias: "BULLISH" | "BEARISH" | "NEUTRAL"; score: number };
    h1: { bias: "BULLISH" | "BEARISH" | "NEUTRAL"; score: number };
    aligned: boolean; conflict: boolean; summary: string; note: string;
  };
  structure?: {
    direction: "BULLISH" | "BEARISH" | "NEUTRAL"; label: string;
    stage: "ENTRY_READY" | "BOS_CONFIRMED" | "CHOCH_DETECTED" | "WAIT_STRUCTURE" | "BEARISH_STRUCTURE";
    choch: boolean; bos: boolean; pullback: boolean; breakLevel: number | null;
    lastSwingHigh: number | null; lastSwingLow: number | null; barsSinceEvent: number | null; summary: string;
  };
  candles?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
};
type MarketMeta = { label: string; benchmark: string; benchmarkLabel: string; currency: string; timeZone: string; hours: string };
type PulseAsset = { key: string; ticker: string; label: string; group: string; value: number; change: number; change5d: number; aboveEma20: boolean };
type Pulse = {
  assets: PulseAsset[]; score: number; regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
  baht: "WEAKENING" | "STRENGTHENING" | "STABLE" | "UNKNOWN"; commodities: "POSITIVE" | "MIXED";
  summary: string; generatedAt: number;
};

const marketOptions: Array<{ key: MarketKey; label: string; sub: string; icon: typeof Globe2 }> = [
  { key: "thai", label: "THAILAND", sub: "หุ้นไทย", icon: CandlestickChart },
  { key: "global", label: "GLOBAL", sub: "หุ้นโลก", icon: Globe2 },
  { key: "etf", label: "ETF", sub: "กองทุน ETF", icon: Coins },
  { key: "crypto", label: "CRYPTO", sub: "คริปโต 24/7", icon: Bitcoin },
];
const marketCopy: Record<MarketKey, { title: string; description: string }> = {
  thai: { title: "สแกนหุ้นไทยเชิงเทคนิค", description: "ค้นหาโอกาสจากหุ้นไทยสภาพคล่องสูงด้วยกฎ D1 / H4 / H1" },
  global: { title: "สแกนหุ้นสำคัญของโลก", description: "ติดตามหุ้นผู้นำระดับโลกและ ADR ที่ซื้อขายในตลาดสหรัฐฯ" },
  etf: { title: "สแกนกองทุน ETF โลก", description: "มองธีมตลาด ดัชนี ประเทศ สินค้าโภคภัณฑ์ และตราสารหนี้" },
  crypto: { title: "สแกนคริปโตเชิงเทคนิค", description: "จับโครงสร้างสินทรัพย์ดิจิทัลหลักในตลาดที่เปิดตลอด 24 ชั่วโมง" },
};
const defaultMeta: MarketMeta = { label: "หุ้นไทย", benchmark: "^SET.BK", benchmarkLabel: "SET Index", currency: "THB", timeZone: "Asia/Bangkok", hours: "จ.–ศ. 10:00–16:30" };
const demoStocks: Stock[] = [
  { symbol: "ADVANC", name: "แอดวานซ์ อินโฟร์ เซอร์วิส", sector: "เทคโนโลยี", price: 326, change: 2.19, score: 92, signal: "Breakout", rsi: 64, volume: 2.4, trend: "ขาขึ้นแข็งแรง", target: 342, stop: 317, seed: 3 },
  { symbol: "CPALL", name: "ซีพี ออลล์", sector: "พาณิชย์", price: 68.25, change: 1.87, score: 88, signal: "Pullback", rsi: 57, volume: 1.8, trend: "ย่อในแนวโน้มขึ้น", target: 72, stop: 66, seed: 7 },
  { symbol: "KBANK", name: "ธนาคารกสิกรไทย", sector: "ธนาคาร", price: 171.5, change: 1.48, score: 85, signal: "Momentum", rsi: 61, volume: 1.6, trend: "โมเมนตัมเร่งตัว", target: 180, stop: 166.5, seed: 11 },
];
const menu = [[LayoutDashboard, "ภาพรวม"], [Radar, "สแกนตลาด"], [Star, "รายการติดตาม"], [BarChart3, "Backtest Lab"]] as const;

function fmtPrice(value: number) {
  const digits = value < 1 ? 4 : value < 100 ? 2 : value < 1000 && value % 1 ? 2 : 0;
  return value.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function ScoreRing({ score }: { score: number }) {
  const r = 30, c = 2 * Math.PI * r;
  return <div className="score-ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r={r} className="ring-base"/><circle cx="36" cy="36" r={r} className="ring-value" strokeDasharray={`${c * score / 100} ${c}`}/></svg><strong>{score}</strong></div>;
}
function BiasBadge({ label, bias, score, compact = false }: { label: string; bias: "BULLISH" | "BEARISH" | "NEUTRAL"; score: number; compact?: boolean }) {
  return <span className={`bias-badge ${bias.toLowerCase()} ${compact ? "compact" : ""}`}><small>{label}</small><i/>{compact ? null : <b>{bias === "BULLISH" ? "ขึ้น" : bias === "BEARISH" ? "ลง" : "กลาง"}</b>}<em>{score}</em></span>;
}

export default function Home() {
  const [marketKey, setMarketKey] = useState<MarketKey>("thai");
  const [marketMeta, setMarketMeta] = useState<MarketMeta>(defaultMeta);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("ADVANC");
  const [signal, setSignal] = useState("ทั้งหมด");
  const [range, setRange] = useState("1M");
  const [timeframe, setTimeframe] = useState("multi");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState("--:--");
  const [source, setSource] = useState("กำลังเชื่อมข้อมูลจริง...");
  const [error, setError] = useState("");
  const [market, setMarket] = useState<{ price: number; change: number } | null>(null);
  const [scanned, setScanned] = useState(0);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [stateFilter, setStateFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"scanner" | "watchlist" | "backtest">("scanner");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [pulseError, setPulseError] = useState(false);

  const displayStocks = stocks.length ? stocks : marketKey === "thai" && !scanning ? demoStocks : [];
  const effectiveState = (stock: Stock): TradeState => pulse?.regime === "RISK_OFF" && stock.state === "TRADE" ? "WAIT" : stock.state ?? "WAIT";
  const watchKey = (stock: Stock) => `${stock.marketKey ?? marketKey}:${stock.symbol}`;
  const filtered = displayStocks.filter((stock) => {
    const matchesSignal = signal === "ทั้งหมด" || stock.signal === signal;
    const matchesSearch = !query || `${stock.symbol} ${stock.name} ${stock.sector}`.toLowerCase().includes(query.toLowerCase());
    const matchesScore = stock.score >= minScore;
    const matchesState = stateFilter === "ALL" || effectiveState(stock) === stateFilter;
    const matchesView = viewMode !== "watchlist" || watchlist.includes(watchKey(stock)) || (marketKey === "thai" && watchlist.includes(stock.symbol));
    return matchesSignal && matchesSearch && matchesScore && matchesState && matchesView;
  });
  const selected = useMemo(() => displayStocks.find((stock) => stock.symbol === selectedSymbol) ?? displayStocks[0] ?? null, [displayStocks, selectedSymbol]);
  const gainers = stocks.filter((stock) => stock.change >= 0).length;
  const breadth = stocks.length ? Math.round(gainers / stocks.length * 100) : 0;
  const interesting = stocks.filter((stock) => effectiveState(stock) === "TRADE" || stock.score >= 70).length;

  async function loadPulse() {
    try {
      const response = await fetch("/api/global-pulse", { cache: "no-store" });
      const data = await response.json() as Pulse & { error?: string };
      if (!response.ok || !data.assets?.length) throw new Error(data.error || "pulse unavailable");
      setPulse(data); setPulseError(false);
    } catch {
      setPulse(null); setPulseError(true);
    }
  }
  async function scan() {
    setScanning(true); setError(""); setStocks([]);
    try {
      const response = await fetch(`/api/scan?timeframe=${timeframe}&market=${marketKey}`, { cache: "no-store" });
      const data = await response.json() as { stocks?: Stock[]; market?: { price: number; change: number } | null; marketMeta?: MarketMeta; scanned?: number; source?: string; generatedAt?: number; error?: string };
      if (!response.ok || !data.stocks?.length) throw new Error(data.error || "ไม่พบข้อมูลสินทรัพย์");
      setStocks(data.stocks); setSelectedSymbol(data.stocks[0].symbol); setMarket(data.market ?? null);
      setMarketMeta(data.marketMeta ?? defaultMeta); setScanned(data.scanned ?? data.stocks.length);
      setSource(data.source ?? "ข้อมูลตลาดจากแหล่งฟรี");
      setLastScan(new Date(data.generatedAt ?? Date.now()).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } catch (scanError) {
      setMarket(null); setSource("แหล่งข้อมูลฟรีขัดข้อง");
      setError(scanError instanceof Error ? scanError.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => { void loadPulse(); }, []);
  useEffect(() => { void scan(); }, [timeframe, marketKey]);
  useEffect(() => {
    try { setWatchlist(JSON.parse(window.localStorage.getItem("marketpulse-watchlist") ?? window.localStorage.getItem("setpulse-watchlist") ?? "[]")); }
    catch { setWatchlist([]); }
  }, []);

  function changeMarket(next: MarketKey) {
    setMarketKey(next); setSignal("ทั้งหมด"); setQuery(""); setMarket(null); setSelectedSymbol("");
  }
  function toggleWatch(stock: Stock) {
    const key = watchKey(stock);
    setWatchlist((current) => {
      const hasLegacy = marketKey === "thai" && current.includes(stock.symbol);
      const next = current.includes(key) || hasLegacy ? current.filter((item) => item !== key && item !== stock.symbol) : [...current, key];
      window.localStorage.setItem("marketpulse-watchlist", JSON.stringify(next));
      return next;
    });
  }
  const isWatched = (stock: Stock) => watchlist.includes(watchKey(stock)) || (marketKey === "thai" && watchlist.includes(stock.symbol));
  const marketStatus = marketKey === "crypto" ? "ตลาดเปิด 24/7" : "ข้อมูลตามเวลาตลาด";

  return (
    <TooltipProvider>
      <main className="app-shell">
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark"><CandlestickChart/></div><div><b>MARKET<span>PULSE</span></b><small>GLOBAL TECHNICAL SCANNER</small></div></div>
          <nav aria-label="เมนูหลัก">{menu.map(([Icon, label], index) => {
            const active = (index === 1 && viewMode === "scanner") || (index === 2 && viewMode === "watchlist") || (index === 3 && viewMode === "backtest");
            return <button key={label} className={active ? "active" : ""} onClick={() => { if (index <= 1) setViewMode("scanner"); if (index === 2) setViewMode("watchlist"); if (index === 3) setViewMode("backtest"); }}><Icon/><span>{label}</span>{index === 2 && watchlist.length > 0 && <em>{watchlist.length}</em>}{active && <i/>}</button>;
          })}</nav>
          <div className="sidebar-bottom"><button><Settings/><span>ตั้งค่าระบบ</span></button><div className="market-status"><span className="pulse-dot"/><div><b>{marketStatus}</b><small>{marketMeta.hours}</small></div></div></div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div><p className="eyebrow"><span/> {viewMode === "backtest" ? "HISTORICAL VALIDATION" : "GLOBAL MARKET INTELLIGENCE"}</p><h1>{viewMode === "backtest" ? "ทดสอบกฎด้วยข้อมูลย้อนหลัง" : marketCopy[marketKey].title}</h1><p>{viewMode === "backtest" ? "วัด Edge ของคะแนนและสัญญาณ ก่อนนำไปใช้กับเงินจริง" : marketCopy[marketKey].description}</p></div>
            {viewMode !== "backtest" && <div className="header-actions"><div className={`demo-pill ${stocks.length ? "live-source" : ""}`}><span/>{source}</div>{searchOpen && <div className="search-box"><Search/><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือ Symbol..." aria-label="ค้นหาสินทรัพย์"/></div>}<Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="ค้นหา" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }}><Search/></Button></TooltipTrigger><TooltipContent>{searchOpen ? "ปิดการค้นหา" : "ค้นหา"}</TooltipContent></Tooltip><Button onClick={() => { void scan(); void loadPulse(); }} disabled={scanning} className="scan-button"><RefreshCw className={scanning ? "spin" : ""}/>{scanning ? "กำลังสแกน..." : "สแกนตลาดตอนนี้"}</Button></div>}
          </header>

          <div className="content">
            {viewMode === "backtest" ? <BacktestLab/> : <>
              <section className="market-switcher" role="tablist" aria-label="เลือกตลาด">
                {marketOptions.map(({ key, label, sub, icon: Icon }) => <button key={key} role="tab" aria-selected={marketKey === key} className={marketKey === key ? "active" : ""} onClick={() => changeMarket(key)}><Icon/><span><b>{label}</b><small>{sub}</small></span>{marketKey === key && <i/>}</button>)}
              </section>

              <section className={`global-pulse ${pulse?.regime.toLowerCase() ?? ""}`}>
                <div className="pulse-summary">
                  <div><p><Activity/> GLOBAL PULSE</p><h2>{pulse ? pulse.regime.replace("_", " ") : pulseError ? "UNAVAILABLE" : "LOADING"}</h2><span>{pulse?.summary ?? (pulseError ? "ไม่สามารถโหลดบริบทโลกได้ — ไม่มีการปรับลดสัญญาณ" : "กำลังอ่านสภาพแวดล้อมตลาดโลก...")}</span></div>
                  <div className="pulse-score"><small>GLOBAL CONTEXT</small><strong>{pulse?.score ?? "—"}</strong><em>/100</em></div>
                </div>
                <div className="pulse-assets">
                  {pulse?.assets.map((asset) => <div key={asset.key}><span>{asset.label}<small>{asset.group}</small></span><strong>{fmtPrice(asset.value)}</strong><em className={asset.change >= 0 ? "positive" : "negative"}>{asset.change >= 0 ? "+" : ""}{asset.change.toFixed(2)}%</em><i className={asset.aboveEma20 ? "above" : "below"}>{asset.aboveEma20 ? "เหนือ EMA20" : "ต่ำกว่า EMA20"}</i></div>) ??
                    Array.from({ length: 8 }, (_, index) => <div className="pulse-skeleton" key={index}/>)}
                </div>
                {pulse && <div className="pulse-context"><span>เงินบาท <b>{pulse.baht === "WEAKENING" ? "อ่อนค่า" : pulse.baht === "STRENGTHENING" ? "แข็งค่า" : "ทรงตัว"}</b></span><span>สินค้าโภคภัณฑ์ <b>{pulse.commodities === "POSITIVE" ? "เป็นบวก" : "ผสม"}</b></span><span>กฎความเสี่ยง <b>{pulse.regime === "RISK_OFF" ? "TRADE → WAIT" : "ไม่ลดสัญญาณ"}</b></span></div>}
              </section>

              <section className="overview-grid">
                <div className="market-card featured"><div className="card-label"><Gauge/>{marketMeta.benchmarkLabel}</div><div className="index-row"><strong>{market ? fmtPrice(market.price) : "—"}</strong>{market && <span className={market.change >= 0 ? "positive" : "negative"}>{market.change >= 0 ? <TrendingUp/> : <TrendingDown/>} {market.change >= 0 ? "+" : ""}{market.change.toFixed(2)}%</span>}</div><div className="spark"><svg viewBox="0 0 290 58" preserveAspectRatio="none"><defs><linearGradient id="limeFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9bf526" stopOpacity=".2"/><stop offset="1" stopColor="#9bf526" stopOpacity="0"/></linearGradient></defs><path d="M0 49 C22 44,27 54,47 45 S77 24,94 32 S121 46,139 33 S170 29,184 20 S216 31,230 18 S262 23,290 5" fill="none" stroke="#9bf526" strokeWidth="2.5"/><path d="M0 49 C22 44,27 54,47 45 S77 24,94 32 S121 46,139 33 S170 29,184 20 S216 31,230 18 S262 23,290 5 V58 H0Z" fill="url(#limeFade)"/></svg></div></div>
                <div className="market-card"><div className="card-label"><Activity/>Market Breadth · {marketMeta.label}</div><div className="breadth"><div className="breadth-ring" style={{ background: `conic-gradient(#9bf526 0 ${breadth}%, #243029 ${breadth}%)` }}><span>{breadth || "—"}{breadth ? "%" : ""}</span></div><div><b>{breadth >= 60 ? "ตลาดเป็นบวก" : breadth >= 40 ? "ตลาดผสม" : stocks.length ? "ตลาดอ่อนตัว" : "รอข้อมูลจริง"}</b><p><i className="up"/> {gainers} ตัวขึ้น</p><p><i className="down"/> {Math.max(0, stocks.length - gainers)} ตัวลง</p></div></div></div>
                <div className="market-card"><div className="card-label"><Zap/>สัญญาณรอบนี้</div><div className="signal-count"><strong>{stocks.length ? interesting : "—"}</strong><div><b>สินทรัพย์เข้าเกณฑ์</b><p>จากที่สแกน {scanned || "—"} ตัว</p></div></div><div className="mini-stats"><span><i/> Breakout <b>{stocks.filter((stock) => stock.signal === "Breakout").length}</b></span><span><i/> Pullback <b>{stocks.filter((stock) => stock.signal === "Pullback").length}</b></span><span><i/> Momentum <b>{stocks.filter((stock) => stock.signal === "Momentum").length}</b></span></div></div>
                <div className="market-card"><div className="card-label"><Clock3/>อัปเดตล่าสุด</div><div className="update-time"><strong>{lastScan}</strong><span>น.</span></div><p className="muted">{marketKey === "crypto" ? "ตลาดเปิด 24/7 · " : ""}{marketMeta.currency} · {marketMeta.hours}</p><div className={`fresh ${error ? "data-error" : ""}`}><span/> {error ? `โหลดจริงไม่สำเร็จ: ${error}` : scanning ? "กำลังประมวลผล..." : stocks.length ? "ข้อมูลจริงพร้อมใช้" : "กำลังเชื่อมต่อ"}</div></div>
              </section>

              <section className="scanner-panel">
                <div className="panel-head"><div><p className="section-kicker">{viewMode === "watchlist" ? <Star/> : <Radar/>} {viewMode === "watchlist" ? "MY WATCHLIST" : "MULTI-ASSET SCANNER"}</p><h2>{viewMode === "watchlist" ? "รายการที่ติดตาม" : `โอกาสใน ${marketMeta.label}`} <span>{filtered.length}</span></h2></div><div className="filters"><div className="universe-chip"><Globe2/><span>{marketMeta.label}<small>{scanned || "—"} สินทรัพย์ · {marketMeta.currency}</small></span></div><Select value={timeframe} onValueChange={setTimeframe}><SelectTrigger aria-label="เลือกกรอบเวลา"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="multi">MTF · D1 / H4 / H1</SelectItem><SelectItem value="day">กรอบวัน (1D)</SelectItem><SelectItem value="hour">60 นาที</SelectItem><SelectItem value="15m">15 นาที</SelectItem></SelectContent></Select><Sheet><SheetTrigger asChild><Button variant="outline" className={minScore > 0 || stateFilter !== "ALL" ? "filter-active" : ""}><ListFilter/> ตัวกรอง{(minScore > 0 || stateFilter !== "ALL") && <span className="filter-dot"/>}</Button></SheetTrigger><SheetContent className="filter-sheet"><SheetHeader><SheetTitle>ตัวกรองสัญญาณ</SheetTitle><SheetDescription>เลือกเฉพาะสินทรัพย์ที่ตรงเกณฑ์การตัดสินใจ</SheetDescription></SheetHeader><div className="filter-body"><label>คะแนนขั้นต่ำ</label><div className="filter-options">{[0, 60, 70, 80].map((value) => <Button key={value} variant={minScore === value ? "default" : "outline"} onClick={() => setMinScore(value)}>{value === 0 ? "ทั้งหมด" : `${value}+`}</Button>)}</div><label>สถานะการตัดสินใจ</label><div className="filter-options vertical">{[["ALL", "ทุกสถานะ"], ["TRADE", "TRADE · เข้าเกณฑ์"], ["WAIT", "WAIT · รอยืนยัน"], ["NO_TRADE", "NO TRADE · งดเทรด"]].map(([value, label]) => <Button key={value} variant={stateFilter === value ? "default" : "outline"} onClick={() => setStateFilter(value)}>{label}</Button>)}</div><div className="filter-summary">พบตามเงื่อนไข <b>{filtered.length}</b> ตัว</div><Button variant="outline" onClick={() => { setMinScore(0); setStateFilter("ALL"); }}>ล้างตัวกรอง</Button></div></SheetContent></Sheet></div></div>
                <div className="signal-tabs" role="tablist" aria-label="ประเภทสัญญาณ">{["ทั้งหมด", "Breakout", "Pullback", "Momentum"].map((item) => <button key={item} role="tab" aria-selected={signal === item} className={signal === item ? "selected" : ""} onClick={() => setSignal(item)}>{item}{item !== "ทั้งหมด" && <span>{displayStocks.filter((stock) => stock.signal === item).length}</span>}</button>)}</div>
                <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>อันดับ / สินทรัพย์</TableHead><TableHead className="text-right">ราคาล่าสุด</TableHead><TableHead>สัญญาณ</TableHead><TableHead>แนวโน้ม</TableHead><TableHead className="text-center">RSI</TableHead><TableHead className="text-center">Volume</TableHead><TableHead className="text-center">คะแนน</TableHead><TableHead/></TableRow></TableHeader><TableBody>
                  {scanning && !displayStocks.length && <TableRow><TableCell colSpan={8}><div className="scan-loading"><RefreshCw className="spin"/><b>กำลังสแกน {marketOptions.find((option) => option.key === marketKey)?.sub}</b><span>ประมวลผล D1 / H4 / H1 และโครงสร้างราคา</span></div></TableCell></TableRow>}
                  {filtered.map((stock, index) => <TableRow key={stock.symbol} data-state={selected?.symbol === stock.symbol ? "selected" : undefined} onClick={() => setSelectedSymbol(stock.symbol)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelectedSymbol(stock.symbol)}><TableCell><div className="stock-name"><span className="rank">{String(index + 1).padStart(2, "0")}</span><div className="ticker-logo">{stock.symbol.slice(0, 2)}</div><div><b>{stock.symbol}</b><small>{stock.sector}</small></div></div></TableCell><TableCell className="text-right"><b>{fmtPrice(stock.price)}</b><small className={stock.change >= 0 ? "positive block" : "negative block"}>{stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}% · {stock.currency ?? marketMeta.currency}</small></TableCell><TableCell><span className={`tag ${stock.signal.toLowerCase()}`}>{stock.signal}</span></TableCell><TableCell>{stock.mtf ? <div className="mtf-compact"><BiasBadge label="D1" {...stock.mtf.d1} compact/><BiasBadge label="H4" {...stock.mtf.h4} compact/><BiasBadge label="H1" {...stock.mtf.h1} compact/></div> : <span className="trend-cell">{stock.change >= 0 ? <TrendingUp/> : <TrendingDown/>}{stock.trend}</span>}</TableCell><TableCell className="text-center"><b>{stock.rsi}</b><span className="rsi-bar"><i style={{ width: `${stock.rsi}%` }}/></span></TableCell><TableCell className="text-center"><b className={stock.volume >= 1.5 ? "positive" : ""}>{stock.volume.toFixed(1)}x</b></TableCell><TableCell className="text-center"><span className={`score ${stock.score >= 80 ? "high" : stock.score >= 65 ? "mid" : "low"}`}>{stock.score}</span></TableCell><TableCell><div className="row-actions"><Button variant="ghost" size="icon-xs" aria-label={`${isWatched(stock) ? "นำออกจาก" : "เพิ่มใน"}รายการติดตาม`} onClick={(event) => { event.stopPropagation(); toggleWatch(stock); }}><Star className={isWatched(stock) ? "starred" : ""}/></Button><ChevronRight className="row-arrow"/></div></TableCell></TableRow>)}
                  {!scanning && filtered.length === 0 && <TableRow><TableCell colSpan={8}><div className="empty-state"><Star/><b>{viewMode === "watchlist" ? "ยังไม่มีสินทรัพย์ในตลาดนี้ที่ติดตาม" : "ไม่พบสินทรัพย์ตามเงื่อนไข"}</b><p>{viewMode === "watchlist" ? "กดดาวข้างชื่อสินทรัพย์เพื่อเก็บไว้ดูภายหลัง" : "ลองลดคะแนนขั้นต่ำหรือล้างคำค้นหา"}</p></div></TableCell></TableRow>}
                </TableBody></Table></div>
              </section>

              {selected && <section className="detail-panel">
                <div className="detail-head"><div className="stock-title"><div className="ticker-logo large">{selected.symbol.slice(0, 2)}</div><div><h2>{selected.symbol} <span>{selected.name}</span></h2><p>{selected.sector} · {marketMeta.label} · {selected.currency ?? marketMeta.currency}</p></div></div><div className="detail-quote-actions"><Button variant="outline" size="icon-sm" aria-label="เพิ่มรายการติดตาม" onClick={() => toggleWatch(selected)}><Star className={isWatched(selected) ? "starred" : ""}/></Button><div className="quote"><strong>{fmtPrice(selected.price)}</strong><span className={selected.change >= 0 ? "positive" : "negative"}>{selected.change >= 0 ? <TrendingUp/> : <TrendingDown/>}{selected.change >= 0 ? "+" : ""}{selected.change.toFixed(2)}%</span></div></div></div>
                <div className="detail-grid"><div className="chart-card"><div className="chart-toolbar"><div><b>INTERACTIVE CHART</b><span>TradingView-style · {marketMeta.currency}</span></div><div className="ranges">{["1D", "1W", "1M", "3M"].map((item) => <button className={range === item ? "active" : ""} onClick={() => setRange(item)} key={item}>{item}</button>)}</div></div><TradingChart stock={selected} range={range} timeframe={timeframe}/></div><aside className="analysis-card">
                  <div className="analysis-title"><div><p>TECHNICAL SCORE</p><h3>โอกาสเชิงเทคนิค <span className={`state-pill ${effectiveState(selected).toLowerCase()}`}>{effectiveState(selected)}</span></h3></div><ScoreRing score={selected.score}/></div>
                  {pulse?.regime === "RISK_OFF" && selected.state === "TRADE" && <div className="macro-override"><Activity/><div><b>Global Risk Override</b><span>เทคนิคผ่าน แต่บริบทโลกเป็น RISK OFF จึงลดจาก TRADE เป็น WAIT</span></div></div>}
                  {selected.mtf && <div className={`mtf-strip ${selected.mtf.conflict ? "conflict" : selected.mtf.aligned ? "aligned" : ""}`}><div className="mtf-badges"><BiasBadge label="D1" {...selected.mtf.d1}/><ChevronRight/><BiasBadge label="H4" {...selected.mtf.h4}/><ChevronRight/><BiasBadge label="H1" {...selected.mtf.h1}/></div><p>{selected.mtf.summary}</p><small>{selected.mtf.note}</small></div>}
                  {selected.structure && <div className={`structure-path ${selected.structure.stage === "ENTRY_READY" ? "ready" : ""}`}><div className="structure-head"><span>H1 MARKET STRUCTURE · {selected.structure.label}</span><b>{selected.structure.stage.replaceAll("_", " ")}</b></div><div className="structure-steps"><span className={selected.structure.choch ? "done" : ""}><i>1</i>CHoCH</span><em/><span className={selected.structure.bos ? "done" : ""}><i>2</i>BOS</span><em/><span className={selected.structure.pullback ? "done" : ""}><i>3</i>Pullback</span></div><p>{selected.structure.summary}</p>{selected.structure.breakLevel && <small>Break level {fmtPrice(selected.structure.breakLevel)} · Swing {selected.structure.lastSwingLow ? fmtPrice(selected.structure.lastSwingLow) : "—"}–{selected.structure.lastSwingHigh ? fmtPrice(selected.structure.lastSwingHigh) : "—"}</small>}</div>}
                  <div className="thesis"><Target/><div><b>{selected.signal}: {selected.trend}</b><p>{selected.reasons?.join(" · ") ?? "กำลังประเมิน EMA, RSI และ Volume เพื่อหาจังหวะที่มี confluence"}</p></div></div>
                  <div className="score-breakdown"><div><span>Trend Score</span><b>{selected.trendScore ?? Math.round(selected.score * .55)}</b><i><em style={{ width: `${selected.trendScore ?? selected.score}%` }}/></i></div><div><span>Entry Score</span><b>{selected.entryScore ?? Math.round(selected.score * .45)}</b><i><em style={{ width: `${selected.entryScore ?? selected.score}%` }}/></i></div><div className="global-score"><span>Global Context</span><b>{pulse?.score ?? "—"}</b><i><em style={{ width: `${pulse?.score ?? 0}%` }}/></i></div></div>
                  <div className="levels"><div><span>แนวต้าน / เป้าหมาย (2 ATR)</span><b className="positive">{fmtPrice(selected.target)}</b></div><div><span>แนวรับกึ่งกลาง</span><b>{fmtPrice((selected.price + selected.stop) / 2)}</b></div><div><span>จุดยกเลิกแผน (1.2 ATR)</span><b className="negative">{fmtPrice(selected.stop)}</b></div></div>
                  <div className="indicators"><span><i className={selected.trend.includes("ขึ้น") ? "ok" : "wait"}/>Trend <b>{selected.trend}</b></span><span><i className="ok"/>RSI <b>{selected.rsi}</b></span><span><i className={selected.volume >= 1.5 ? "ok" : "wait"}/>Volume <b>{selected.volume >= 1.5 ? "ยืนยัน" : "รอยืนยัน"}</b></span></div>
                  <p className="disclaimer">ข้อมูลจากแหล่งฟรีอาจหน่วงและต่างกันตามตลาด · เพื่อการศึกษา ไม่ใช่คำแนะนำซื้อขาย · ตรวจราคาจริงกับโบรกเกอร์ก่อนส่งคำสั่ง</p>
                </aside></div>
              </section>}
            </>}
          </div>
        </section>
      </main>
    </TooltipProvider>
  );
}
