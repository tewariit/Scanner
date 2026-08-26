"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, CandlestickChart, ChevronRight, Clock3, Gauge,
  LayoutDashboard, ListFilter, Radar, RefreshCw, Search, Settings,
  Star, Target, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BacktestLab } from "@/components/backtest-lab";

type Stock = {
  symbol: string; name: string; sector: string; price: number; change: number;
  score: number; signal: "Breakout" | "Pullback" | "Momentum" | "Watch"; rsi: number;
  volume: number; trend: string; target: number; stop: number; seed?: number;
  trendScore?: number; entryScore?: number; state?: "TRADE" | "WAIT" | "NO_TRADE";
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

const demoStocks: Stock[] = [
  { symbol: "ADVANC", name: "แอดวานซ์ อินโฟร์ เซอร์วิส", sector: "เทคโนโลยี", price: 326, change: 2.19, score: 92, signal: "Breakout", rsi: 64, volume: 2.4, trend: "ขาขึ้นแข็งแรง", target: 342, stop: 317, seed: 3 },
  { symbol: "CPALL", name: "ซีพี ออลล์", sector: "พาณิชย์", price: 68.25, change: 1.87, score: 88, signal: "Pullback", rsi: 57, volume: 1.8, trend: "ย่อในแนวโน้มขึ้น", target: 72, stop: 66, seed: 7 },
  { symbol: "KBANK", name: "ธนาคารกสิกรไทย", sector: "ธนาคาร", price: 171.5, change: 1.48, score: 85, signal: "Momentum", rsi: 61, volume: 1.6, trend: "โมเมนตัมเร่งตัว", target: 180, stop: 166.5, seed: 11 },
  { symbol: "GULF", name: "กัลฟ์ ดีเวลลอปเมนท์", sector: "พลังงาน", price: 48.75, change: 1.04, score: 82, signal: "Breakout", rsi: 59, volume: 2.1, trend: "ผ่านแนวต้านสำคัญ", target: 51.5, stop: 47.5, seed: 17 },
  { symbol: "BDMS", name: "กรุงเทพดุสิตเวชการ", sector: "การแพทย์", price: 22.6, change: 0.89, score: 78, signal: "Pullback", rsi: 53, volume: 1.3, trend: "ทดสอบ EMA20", target: 24, stop: 21.9, seed: 21 },
  { symbol: "PTT", name: "ปตท.", sector: "พลังงาน", price: 33.75, change: -0.74, score: 61, signal: "Pullback", rsi: 46, volume: 0.9, trend: "ฟื้นตัวระยะสั้น", target: 35, stop: 32.75, seed: 26 },
  { symbol: "DELTA", name: "เดลต้า อีเลคโทรนิคส์", sector: "ชิ้นส่วนอิเล็กทรอนิกส์", price: 156, change: -1.27, score: 54, signal: "Momentum", rsi: 42, volume: 1.1, trend: "โมเมนตัมอ่อนลง", target: 164, stop: 151, seed: 31 },
];

const menu = [
  [LayoutDashboard, "ภาพรวม"], [Radar, "สแกนหุ้น"],
  [Star, "หุ้นที่ติดตาม"], [BarChart3, "Backtest Lab"],
] as const;

function fmtPrice(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: value < 100 ? 2 : value % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function makeSeries(stock: Stock, range: string) {
  const count = range === "1D" ? 22 : range === "1W" ? 30 : range === "1M" ? 40 : 48;
  const scale = stock.price * 0.006;
  const points = Array.from({ length: count }, (_, i) => {
    const seed = stock.seed ?? 1;
    const wave = Math.sin((i + seed) * 0.62) * scale + Math.cos((i + seed) * 0.21) * scale * 0.55;
    const drift = (i - count) * scale * (stock.score > 70 ? 0.13 : 0.035);
    const close = stock.price + wave + drift;
    const open = close - Math.sin((i + seed) * 1.17) * scale * 0.65;
    return { open, close, high: Math.max(open, close) + scale * (0.35 + ((i * 7) % 5) / 8), low: Math.min(open, close) - scale * (0.35 + ((i * 3) % 5) / 8) };
  });
  points[points.length - 1].close = stock.price;
  return points;
}

function StockChart({ stock, range }: { stock: Stock; range: string }) {
  const series = useMemo(() => {
    if (!stock.candles?.length) return makeSeries(stock, range);
    const count = range === "1D" ? 22 : range === "1W" ? 30 : range === "1M" ? 45 : 70;
    return stock.candles.slice(-count);
  }, [stock, range]);
  const all = series.flatMap((p) => [p.high, p.low]);
  const min = Math.min(...all) * 0.997;
  const max = Math.max(...all) * 1.003;
  const y = (price: number) => 222 - ((price - min) / (max - min)) * 190;
  const step = 650 / series.length;
  const averageLine = (period: number) => series.map((_, i) => {
    const from = Math.max(0, i - period);
    const avg = series.slice(from, i + 1).reduce((sum, p) => sum + p.close, 0) / (i - from + 1);
    return `${18 + i * step + step / 2},${y(avg)}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 730 250" className="price-chart" role="img" aria-label={`กราฟแท่งเทียนของ ${stock.symbol}`}>
      {[32, 79, 127, 174, 222].map((gy) => <line key={gy} x1="18" x2="668" y1={gy} y2={gy} stroke="#28313a" strokeDasharray="3 5" />)}
      <rect x="18" y={y(stock.target)} width="650" height="2" fill="#9bf526" opacity=".3" />
      {series.map((p, i) => {
        const up = p.close >= p.open;
        const x = 18 + i * step + step / 2;
        const color = up ? "#37e6a1" : "#ff667d";
        return <g key={i}><line x1={x} x2={x} y1={y(p.high)} y2={y(p.low)} stroke={color}/><rect x={x - Math.max(2, step * .25)} y={Math.min(y(p.open), y(p.close))} width={Math.max(4, step * .5)} height={Math.max(2, Math.abs(y(p.open) - y(p.close)))} rx="1" fill={color}/></g>;
      })}
      <polyline points={averageLine(11)} fill="none" stroke="#818cf8" strokeWidth="1.5" opacity=".9" />
      <polyline points={averageLine(5)} fill="none" stroke="#f8c35d" strokeWidth="1.5" opacity=".95" />
      {[max, (max + min) / 2, min].map((price, i) => <text key={i} x="680" y={[38, 132, 224][i]} fill="#77828f" fontSize="11">{fmtPrice(price)}</text>)}
      <g transform={`translate(618 ${Math.max(18, y(stock.price) - 10)})`}><rect width="58" height="20" rx="5" fill="#9bf526"/><text x="29" y="14" textAnchor="middle" fill="#101610" fontSize="11" fontWeight="700">{fmtPrice(stock.price)}</text></g>
    </svg>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 30; const c = 2 * Math.PI * r;
  return <div className="score-ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r={r} className="ring-base"/><circle cx="36" cy="36" r={r} className="ring-value" strokeDasharray={`${c * score / 100} ${c}`}/></svg><strong>{score}</strong></div>;
}

function BiasBadge({ label, bias, score, compact = false }: { label: string; bias: "BULLISH" | "BEARISH" | "NEUTRAL"; score: number; compact?: boolean }) {
  return <span className={`bias-badge ${bias.toLowerCase()} ${compact ? "compact" : ""}`}><small>{label}</small><i/>{compact ? null : <b>{bias === "BULLISH" ? "ขึ้น" : bias === "BEARISH" ? "ลง" : "กลาง"}</b>}<em>{score}</em></span>;
}

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selected, setSelected] = useState(demoStocks[0]);
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
  const displayStocks = stocks.length ? stocks : demoStocks;
  const filtered = displayStocks.filter((stock) => {
    const matchesSignal = signal === "ทั้งหมด" || stock.signal === signal;
    const matchesSearch = !query || `${stock.symbol} ${stock.name} ${stock.sector}`.toLowerCase().includes(query.toLowerCase());
    const matchesScore = stock.score >= minScore;
    const matchesState = stateFilter === "ALL" || (stock.state ?? "WAIT") === stateFilter;
    const matchesView = viewMode !== "watchlist" || watchlist.includes(stock.symbol);
    return matchesSignal && matchesSearch && matchesScore && matchesState && matchesView;
  });
  const gainers = stocks.filter((s) => s.change >= 0).length;
  const breadth = stocks.length ? Math.round(gainers / stocks.length * 100) : 0;
  const interesting = stocks.filter((s) => s.state === "TRADE" || s.score >= 70).length;

  async function scan() {
    setScanning(true);
    setError("");
    try {
      const response = await fetch(`/api/scan?timeframe=${timeframe}`, { cache: "no-store" });
      const data = await response.json() as { stocks?: Stock[]; market?: { price: number; change: number } | null; scanned?: number; source?: string; generatedAt?: number; error?: string };
      if (!response.ok || !data.stocks?.length) throw new Error(data.error || "ไม่พบข้อมูลหุ้น");
      setStocks(data.stocks);
      setSelected(data.stocks[0]);
      setMarket(data.market ?? null);
      setScanned(data.scanned ?? data.stocks.length);
      setSource(data.source ?? "ข้อมูลหน่วงประมาณ 15 นาที");
      setLastScan(new Date(data.generatedAt ?? Date.now()).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } catch (scanError) {
      setStocks([]);
      setMarket(null);
      setSource("ข้อมูลตัวอย่าง · แหล่งฟรีขัดข้อง");
      setError(scanError instanceof Error ? scanError.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally { setScanning(false); }
  }

  useEffect(() => { void scan(); }, [timeframe]);
  useEffect(() => {
    try { setWatchlist(JSON.parse(window.localStorage.getItem("setpulse-watchlist") ?? "[]")); } catch { setWatchlist([]); }
  }, []);

  function toggleWatch(symbol: string) {
    setWatchlist((current) => {
      const next = current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol];
      window.localStorage.setItem("setpulse-watchlist", JSON.stringify(next));
      return next;
    });
  }

  return (
    <TooltipProvider>
      <main className="app-shell">
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark"><CandlestickChart/></div><div><b>SET<span>PULSE</span></b><small>TECHNICAL SCANNER</small></div></div>
          <nav aria-label="เมนูหลัก">{menu.map(([Icon, label], i) => { const active = (i === 1 && viewMode === "scanner") || (i === 2 && viewMode === "watchlist") || (i === 3 && viewMode === "backtest"); return <button key={label} className={active ? "active" : ""} onClick={() => { if (i === 1) setViewMode("scanner"); if (i === 2) setViewMode("watchlist"); if (i === 3) setViewMode("backtest"); }}><Icon/><span>{label}</span>{i === 2 && watchlist.length > 0 && <em>{watchlist.length}</em>}{active && <i/>}</button>; })}</nav>
          <div className="sidebar-bottom"><button><Settings/><span>ตั้งค่าระบบ</span></button><div className="market-status"><span className="pulse-dot"/><div><b>ตลาดเปิด</b><small>ปิดในอีก 1 ชม. 55 นาที</small></div></div></div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div><p className="eyebrow"><span/> {viewMode === "backtest" ? "HISTORICAL VALIDATION" : "LIVE MARKET INTELLIGENCE"}</p><h1>{viewMode === "backtest" ? "ทดสอบกฎด้วยข้อมูลย้อนหลัง" : "สแกนหุ้นไทยเชิงเทคนิค"}</h1><p>{viewMode === "backtest" ? "วัด Edge ของคะแนนและสัญญาณ ก่อนนำไปใช้กับเงินจริง" : "ค้นหาโอกาสที่น่าสนใจจาก SET ด้วยข้อมูลราคาและโมเมนตัม"}</p></div>
            {viewMode !== "backtest" && <div className="header-actions"><div className={`demo-pill ${stocks.length ? "live-source" : ""}`}><span/>{source}</div>{searchOpen && <div className="search-box"><Search/><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา ADVANC, ธนาคาร..." aria-label="ค้นหาหุ้น"/></div>}<Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="ค้นหา" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }}><Search/></Button></TooltipTrigger><TooltipContent>{searchOpen ? "ปิดการค้นหา" : "ค้นหาหุ้น"}</TooltipContent></Tooltip><Button onClick={() => void scan()} disabled={scanning} className="scan-button"><RefreshCw className={scanning ? "spin" : ""}/>{scanning ? "กำลังสแกน..." : "สแกนตลาดตอนนี้"}</Button></div>}
          </header>

          <div className="content">
            {viewMode === "backtest" ? <BacktestLab/> : <>
            <section className="overview-grid">
              <div className="market-card featured"><div className="card-label"><Gauge/>ภาพรวม SET Index</div><div className="index-row"><strong>{market ? fmtPrice(market.price) : "—"}</strong>{market && <span className={market.change >= 0 ? "positive" : "negative"}>{market.change >= 0 ? <TrendingUp/> : <TrendingDown/>} {market.change >= 0 ? "+" : ""}{market.change.toFixed(2)}%</span>}</div><div className="spark"><svg viewBox="0 0 290 58" preserveAspectRatio="none"><defs><linearGradient id="limeFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9bf526" stopOpacity=".2"/><stop offset="1" stopColor="#9bf526" stopOpacity="0"/></linearGradient></defs><path d="M0 49 C22 44,27 54,47 45 S77 24,94 32 S121 46,139 33 S170 29,184 20 S216 31,230 18 S262 23,290 5" fill="none" stroke="#9bf526" strokeWidth="2.5"/><path d="M0 49 C22 44,27 54,47 45 S77 24,94 32 S121 46,139 33 S170 29,184 20 S216 31,230 18 S262 23,290 5 V58 H0Z" fill="url(#limeFade)"/></svg></div></div>
              <div className="market-card"><div className="card-label"><Activity/>Market Breadth · กลุ่มที่สแกน</div><div className="breadth"><div className="breadth-ring" style={{background: `conic-gradient(#9bf526 0 ${breadth}%, #243029 ${breadth}%)`}}><span>{breadth || "—"}{breadth ? "%" : ""}</span></div><div><b>{breadth >= 60 ? "ตลาดเป็นบวก" : breadth >= 40 ? "ตลาดผสม" : stocks.length ? "ตลาดอ่อนตัว" : "รอข้อมูลจริง"}</b><p><i className="up"/> {gainers} หุ้นขึ้น</p><p><i className="down"/> {Math.max(0, stocks.length - gainers)} หุ้นลง</p></div></div></div>
              <div className="market-card"><div className="card-label"><Zap/>สัญญาณรอบนี้</div><div className="signal-count"><strong>{stocks.length ? interesting : "—"}</strong><div><b>หุ้นเข้าเกณฑ์</b><p>จากหุ้นที่สแกน {scanned || "—"} ตัว</p></div></div><div className="mini-stats"><span><i/> Breakout <b>{stocks.filter(s => s.signal === "Breakout").length}</b></span><span><i/> Pullback <b>{stocks.filter(s => s.signal === "Pullback").length}</b></span><span><i/> Momentum <b>{stocks.filter(s => s.signal === "Momentum").length}</b></span></div></div>
              <div className="market-card"><div className="card-label"><Clock3/>อัปเดตล่าสุด</div><div className="update-time"><strong>{lastScan}</strong><span>น.</span></div><p className="muted">ข้อมูลหน่วงประมาณ 15 นาที</p><div className={`fresh ${error ? "data-error" : ""}`}><span/> {error ? `โหลดจริงไม่สำเร็จ: ${error}` : scanning ? "กำลังประมวลผล..." : stocks.length ? "ข้อมูลจริงพร้อมใช้" : "กำลังเชื่อมต่อ"}</div></div>
            </section>

            <section className="scanner-panel">
              <div className="panel-head"><div><p className="section-kicker">{viewMode === "watchlist" ? <Star/> : <Radar/>} {viewMode === "watchlist" ? "MY WATCHLIST" : timeframe === "multi" ? "MULTI-TIMEFRAME SCANNER" : "DETERMINISTIC SCANNER"}</p><h2>{viewMode === "watchlist" ? "หุ้นที่ติดตาม" : "หุ้นที่น่าสนใจตอนนี้"} <span>{filtered.length}</span></h2></div><div className="filters"><Select defaultValue="liquid"><SelectTrigger aria-label="เลือกจักรวาลหุ้น"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="liquid">หุ้นสภาพคล่องสูง 17 ตัว</SelectItem></SelectContent></Select><Select value={timeframe} onValueChange={setTimeframe}><SelectTrigger aria-label="เลือกกรอบเวลา"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="multi">MTF · D1 / H4 / H1</SelectItem><SelectItem value="day">กรอบวัน (1D)</SelectItem><SelectItem value="hour">60 นาที</SelectItem><SelectItem value="15m">15 นาที</SelectItem></SelectContent></Select><Sheet><SheetTrigger asChild><Button variant="outline" className={minScore > 0 || stateFilter !== "ALL" ? "filter-active" : ""}><ListFilter/> ตัวกรอง{(minScore > 0 || stateFilter !== "ALL") && <span className="filter-dot"/>}</Button></SheetTrigger><SheetContent className="filter-sheet"><SheetHeader><SheetTitle>ตัวกรองสัญญาณ</SheetTitle><SheetDescription>เลือกเฉพาะหุ้นที่ตรงเกณฑ์การตัดสินใจของคุณ</SheetDescription></SheetHeader><div className="filter-body"><label>คะแนนขั้นต่ำ</label><div className="filter-options">{[0, 60, 70, 80].map(value => <Button key={value} variant={minScore === value ? "default" : "outline"} onClick={() => setMinScore(value)}>{value === 0 ? "ทั้งหมด" : `${value}+`}</Button>)}</div><label>สถานะการตัดสินใจ</label><div className="filter-options vertical">{[["ALL","ทุกสถานะ"],["TRADE","TRADE · เข้าเกณฑ์"],["WAIT","WAIT · รอยืนยัน"],["NO_TRADE","NO TRADE · งดเทรด"]].map(([value,label]) => <Button key={value} variant={stateFilter === value ? "default" : "outline"} onClick={() => setStateFilter(value)}>{label}</Button>)}</div><div className="filter-summary">พบหุ้นตามเงื่อนไข <b>{filtered.length}</b> ตัว</div><Button variant="outline" onClick={() => { setMinScore(0); setStateFilter("ALL"); }}>ล้างตัวกรอง</Button></div></SheetContent></Sheet></div></div>
              <div className="signal-tabs" role="tablist" aria-label="ประเภทสัญญาณ">{["ทั้งหมด", "Breakout", "Pullback", "Momentum"].map((item) => <button key={item} role="tab" aria-selected={signal === item} className={signal === item ? "selected" : ""} onClick={() => setSignal(item)}>{item}{item !== "ทั้งหมด" && <span>{displayStocks.filter(s => s.signal === item).length}</span>}</button>)}</div>
              <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>อันดับ / หุ้น</TableHead><TableHead className="text-right">ราคาล่าสุด</TableHead><TableHead>สัญญาณ</TableHead><TableHead>แนวโน้ม</TableHead><TableHead className="text-center">RSI</TableHead><TableHead className="text-center">Volume</TableHead><TableHead className="text-center">คะแนน</TableHead><TableHead/></TableRow></TableHeader><TableBody>{filtered.map((stock, i) => <TableRow key={stock.symbol} data-state={selected.symbol === stock.symbol ? "selected" : undefined} onClick={() => setSelected(stock)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(stock)}><TableCell><div className="stock-name"><span className="rank">{String(i + 1).padStart(2, "0")}</span><div className="ticker-logo">{stock.symbol.slice(0, 2)}</div><div><b>{stock.symbol}</b><small>{stock.sector}</small></div></div></TableCell><TableCell className="text-right"><b>{fmtPrice(stock.price)}</b><small className={stock.change >= 0 ? "positive block" : "negative block"}>{stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%</small></TableCell><TableCell><span className={`tag ${stock.signal.toLowerCase()}`}>{stock.signal}</span></TableCell><TableCell>{stock.mtf ? <div className="mtf-compact"><BiasBadge label="D1" {...stock.mtf.d1} compact/><BiasBadge label="H4" {...stock.mtf.h4} compact/><BiasBadge label="H1" {...stock.mtf.h1} compact/></div> : <span className="trend-cell">{stock.change >= 0 ? <TrendingUp/> : <TrendingDown/>}{stock.trend}</span>}</TableCell><TableCell className="text-center"><b>{stock.rsi}</b><span className="rsi-bar"><i style={{width: `${stock.rsi}%`}}/></span></TableCell><TableCell className="text-center"><b className={stock.volume >= 1.5 ? "positive" : ""}>{stock.volume.toFixed(1)}x</b></TableCell><TableCell className="text-center"><span className={`score ${stock.score >= 80 ? "high" : stock.score >= 65 ? "mid" : "low"}`}>{stock.score}</span></TableCell><TableCell><div className="row-actions"><Button variant="ghost" size="icon-xs" aria-label={`${watchlist.includes(stock.symbol) ? "นำออกจาก" : "เพิ่มใน"}หุ้นที่ติดตาม`} onClick={(event) => { event.stopPropagation(); toggleWatch(stock.symbol); }}><Star className={watchlist.includes(stock.symbol) ? "starred" : ""}/></Button><ChevronRight className="row-arrow"/></div></TableCell></TableRow>)}{filtered.length === 0 && <TableRow><TableCell colSpan={8}><div className="empty-state"><Star/><b>{viewMode === "watchlist" && watchlist.length === 0 ? "ยังไม่มีหุ้นที่ติดตาม" : "ไม่พบหุ้นตามเงื่อนไข"}</b><p>{viewMode === "watchlist" && watchlist.length === 0 ? "กดดาวข้างชื่อหุ้นเพื่อเก็บไว้ดูภายหลัง" : "ลองลดคะแนนขั้นต่ำหรือล้างคำค้นหา"}</p></div></TableCell></TableRow>}</TableBody></Table></div>
            </section>

            <section className="detail-panel">
              <div className="detail-head"><div className="stock-title"><div className="ticker-logo large">{selected.symbol.slice(0, 2)}</div><div><h2>{selected.symbol} <span>{selected.name}</span></h2><p>{selected.sector} · หุ้นสภาพคล่องสูง</p></div></div><div className="detail-quote-actions"><Button variant="outline" size="icon-sm" aria-label="เพิ่มหุ้นที่ติดตาม" onClick={() => toggleWatch(selected.symbol)}><Star className={watchlist.includes(selected.symbol) ? "starred" : ""}/></Button><div className="quote"><strong>{fmtPrice(selected.price)}</strong><span className={selected.change >= 0 ? "positive" : "negative"}>{selected.change >= 0 ? <TrendingUp/> : <TrendingDown/>}{selected.change >= 0 ? "+" : ""}{selected.change.toFixed(2)}%</span></div></div></div>
              <div className="detail-grid"><div className="chart-card"><div className="chart-toolbar"><div><span className="legend candle"/>ราคา <span className="legend ema20"/>EMA20 <span className="legend ema50"/>EMA50</div><div className="ranges">{["1D", "1W", "1M", "3M"].map(r => <button className={range === r ? "active" : ""} onClick={() => setRange(r)} key={r}>{r}</button>)}</div></div><StockChart stock={selected} range={range}/></div><aside className="analysis-card"><div className="analysis-title"><div><p>TECHNICAL SCORE</p><h3>โอกาสเชิงเทคนิค <span className={`state-pill ${(selected.state ?? "WAIT").toLowerCase()}`}>{selected.state ?? "WAIT"}</span></h3></div><ScoreRing score={selected.score}/></div>{selected.mtf && <div className={`mtf-strip ${selected.mtf.conflict ? "conflict" : selected.mtf.aligned ? "aligned" : ""}`}><div className="mtf-badges"><BiasBadge label="D1" {...selected.mtf.d1}/><ChevronRight/><BiasBadge label="H4" {...selected.mtf.h4}/><ChevronRight/><BiasBadge label="H1" {...selected.mtf.h1}/></div><p>{selected.mtf.summary}</p><small>{selected.mtf.note}</small></div>}{selected.structure && <div className={`structure-path ${selected.structure.stage === "ENTRY_READY" ? "ready" : ""}`}><div className="structure-head"><span>H1 MARKET STRUCTURE · {selected.structure.label}</span><b>{selected.structure.stage.replaceAll("_", " ")}</b></div><div className="structure-steps"><span className={selected.structure.choch ? "done" : ""}><i>1</i>CHoCH</span><em/><span className={selected.structure.bos ? "done" : ""}><i>2</i>BOS</span><em/><span className={selected.structure.pullback ? "done" : ""}><i>3</i>Pullback</span></div><p>{selected.structure.summary}</p>{selected.structure.breakLevel && <small>Break level {fmtPrice(selected.structure.breakLevel)} · Swing {selected.structure.lastSwingLow ? fmtPrice(selected.structure.lastSwingLow) : "—"}–{selected.structure.lastSwingHigh ? fmtPrice(selected.structure.lastSwingHigh) : "—"}</small>}</div>}<div className="thesis"><Target/><div><b>{selected.signal}: {selected.trend}</b><p>{selected.reasons?.join(" · ") ?? "กำลังประเมิน EMA, RSI และ Volume เพื่อหาจังหวะที่มี confluence"}</p></div></div><div className="score-breakdown"><div><span>Trend Score</span><b>{selected.trendScore ?? Math.round(selected.score * .55)}</b><i><em style={{width: `${selected.trendScore ?? selected.score}%`}}/></i></div><div><span>Entry Score</span><b>{selected.entryScore ?? Math.round(selected.score * .45)}</b><i><em style={{width: `${selected.entryScore ?? selected.score}%`}}/></i></div></div><div className="levels"><div><span>แนวต้าน / เป้าหมาย (2 ATR)</span><b className="positive">{fmtPrice(selected.target)}</b></div><div><span>แนวรับกึ่งกลาง</span><b>{fmtPrice((selected.price + selected.stop) / 2)}</b></div><div><span>จุดยกเลิกแผน (1.2 ATR)</span><b className="negative">{fmtPrice(selected.stop)}</b></div></div><div className="indicators"><span><i className={selected.trend.includes("ขึ้น") ? "ok" : "wait"}/>Trend <b>{selected.trend}</b></span><span><i className="ok"/>RSI <b>{selected.rsi}</b></span><span><i className={selected.volume >= 1.5 ? "ok" : "wait"}/>Volume <b>{selected.volume >= 1.5 ? "ยืนยัน" : "รอยืนยัน"}</b></span></div><p className="disclaimer">ข้อมูลหน่วงประมาณ 15 นาที เพื่อการศึกษา ไม่ใช่คำแนะนำซื้อขาย · ตรวจราคาจริงกับโบรกเกอร์ก่อนส่งคำสั่ง</p></aside></div>
            </section>
            </>}
          </div>
        </section>
      </main>
    </TooltipProvider>
  );
}
