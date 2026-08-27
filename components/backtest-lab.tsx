"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, FlaskConical, RefreshCw, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { thaiAllUniverse } from "@/lib/thai-universe";

type Metric = { total: number; wins: number; losses: number; winRate: number; netR: number; expectancy: number; profitFactor: number; maxDrawdown: number; averageWin: number; averageLoss: number; equityCurve: Array<{ time: number; equity: number }> };
type GroupMetric = Metric & { name: string };
type Trade = { symbol: string; signal: string; score: number; date: string; exitDate: string; entry: number; stop: number; target: number; resultR: number; outcome: string; holdBars: number };
type MarketKey = "thai" | "global" | "etf" | "crypto";
type BacktestData = {
  market: { key: MarketKey; label: string; assetLabel: string };
  assumptions: { months: number; timeframe: string; minScore: number; structure: string; rr: number; atrStop: number; maxTradesPerDay: number; holdingBars: number; feeRate: number; entry: string; sameBarRule: string };
  coverage: { requested: number; succeeded: number }; metrics: Metric;
  funnel: { structureReady: number; mtfAligned: number; scorePassed: number };
  comparisons: Array<Metric & { score: number }>; bySignal: GroupMetric[]; byStock: GroupMetric[];
  recentTrades: Trade[]; source: string; generatedAt: number;
};

function fmt(value: number, digits = 2) { return Number.isFinite(value) ? value.toFixed(digits) : "—"; }

function EquityChart({ points }: { points: Array<{ time: number; equity: number }> }) {
  if (points.length < 2) return <div className="backtest-empty">ข้อมูลยังไม่พอสร้าง Equity Curve</div>;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values, 0), max = Math.max(...values, 0);
  const spread = Math.max(1, max - min);
  const x = (index: number) => 18 + index / (points.length - 1) * 682;
  const y = (value: number) => 215 - (value - min) / spread * 180;
  const line = points.map((point, index) => `${x(index)},${y(point.equity)}`).join(" ");
  const area = `18,215 ${line} 700,215`;
  return <svg viewBox="0 0 720 235" className="equity-chart" role="img" aria-label="กราฟผลตอบแทนสะสมหน่วย R"><defs><linearGradient id="equityFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9bf526" stopOpacity=".22"/><stop offset="1" stopColor="#9bf526" stopOpacity="0"/></linearGradient></defs>{[35,80,125,170,215].map(grid => <line key={grid} x1="18" x2="700" y1={grid} y2={grid} stroke="#28323a" strokeDasharray="3 5"/>)}<line x1="18" x2="700" y1={y(0)} y2={y(0)} stroke="#5a6670" strokeDasharray="4 4"/><polygon points={area} fill="url(#equityFade)"/><polyline points={line} fill="none" stroke="#9bf526" strokeWidth="2.2" strokeLinejoin="round"/><text x="705" y={Math.max(13,y(max)+4)} fill="#8d999f" fontSize="10">{fmt(max)}R</text><text x="705" y={Math.min(230,y(min)+4)} fill="#8d999f" fontSize="10">{fmt(min)}R</text></svg>;
}

function MetricCard({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: string }) {
  return <article className={`result-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

export function BacktestLab() {
  const [market, setMarket] = useState<MarketKey>("thai");
  const [months, setMonths] = useState("12");
  const [score, setScore] = useState("70");
  const [thaiScope, setThaiScope] = useState<"leaders" | "single">("leaders");
  const [assetSymbol, setAssetSymbol] = useState("");
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runBacktest() {
    setLoading(true); setError(""); setData(null);
    try {
      if (market === "thai" && thaiScope === "single" && !assetSymbol.trim()) throw new Error("กรุณาพิมพ์ Symbol หุ้นไทยที่ต้องการทดสอบ");
      const params = new URLSearchParams({ market, months, score, ...(market === "thai" && thaiScope === "single" ? { symbol: assetSymbol.trim().toUpperCase() } : {}) });
      const response = await fetch(`/api/backtest?${params}`, { cache: "no-store" });
      const result = await response.json() as BacktestData & { error?: string };
      if (!response.ok) throw new Error(result.error || "ไม่สามารถประมวลผล Backtest ได้");
      setData(result);
    } catch (backtestError) { setData(null); setError(backtestError instanceof Error ? backtestError.message : "Backtest ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void runBacktest(); }, []);
  const bestSignal = useMemo(() => data?.bySignal[0], [data]);

  return <section className="backtest-lab">
    <div className="backtest-hero"><div><p className="section-kicker"><FlaskConical/> MTF WALK-FORWARD SIMULATION</p><h2>Backtest Lab <span>MTF Beta</span></h2><p>ทดสอบกฎเดียวกับ Scanner ครบทั้งหุ้นไทย หุ้นโลก ETF / กองทุน และคริปโต</p></div><div className="backtest-controls"><Select value={market} onValueChange={(value) => { setMarket(value as MarketKey); setAssetSymbol(""); setData(null); setError(""); }}><SelectTrigger aria-label="เลือกตลาดสำหรับ Backtest"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="thai">หุ้นไทย · 537</SelectItem><SelectItem value="global">หุ้นโลก · 16</SelectItem><SelectItem value="etf">ETF / กองทุน · 16</SelectItem><SelectItem value="crypto">คริปโต · 12</SelectItem></SelectContent></Select>{market === "thai" && <Select value={thaiScope} onValueChange={(value) => { setThaiScope(value as "leaders" | "single"); setData(null); setError(""); }}><SelectTrigger aria-label="เลือกรูปแบบสินทรัพย์หุ้นไทย"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="leaders">ชุดผู้นำ · 17 ตัว</SelectItem><SelectItem value="single">เลือกหุ้นรายตัว · 537 ตัว</SelectItem></SelectContent></Select>}{market === "thai" && thaiScope === "single" && <div className="asset-symbol-input"><Input list="thai-backtest-symbols" value={assetSymbol} onChange={(event) => setAssetSymbol(event.target.value.toUpperCase())} placeholder="Symbol เช่น ADVANC" aria-label="ค้นหา Symbol หุ้นไทย"/><datalist id="thai-backtest-symbols">{thaiAllUniverse.map(([symbol, , name]) => <option key={symbol} value={symbol}>{name}</option>)}</datalist></div>}<Select value={months} onValueChange={setMonths}><SelectTrigger aria-label="ระยะเวลาทดสอบ"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="3">ย้อนหลัง 3 เดือน</SelectItem><SelectItem value="6">ย้อนหลัง 6 เดือน</SelectItem><SelectItem value="12">ย้อนหลัง 12 เดือน</SelectItem></SelectContent></Select><Select value={score} onValueChange={setScore}><SelectTrigger aria-label="คะแนนขั้นต่ำ"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="60">คะแนน 60+</SelectItem><SelectItem value="70">คะแนน 70+</SelectItem><SelectItem value="80">คะแนน 80+</SelectItem></SelectContent></Select><Button onClick={() => void runBacktest()} disabled={loading}><RefreshCw className={loading ? "spin" : ""}/>{loading ? "กำลังคำนวณ" : "เริ่มทดสอบ"}</Button></div></div>

    {error && <div className="backtest-alert error"><AlertTriangle/><div><b>ประมวลผลไม่สำเร็จ</b><p>{error} · ลองใหม่อีกครั้งเมื่อผู้ให้บริการข้อมูลพร้อม</p></div></div>}
    {loading && !data ? <div className="backtest-loading">{Array.from({length:6}).map((_,index)=><Skeleton key={index} className="h-28 rounded-xl bg-[#172129]"/>)}</div> : data && <>
      <div className="method-strip"><ShieldCheck/><span><b>{data.market.label} · MTF Conservative:</b> ใช้เฉพาะแท่งที่ปิดแล้ว · เข้า Open ของ H1 ถัดไป · SL 1.2 ATR · TP 2R · ต้นทุน 0.15% · ชนพร้อมกันให้นับ SL</span><em>ข้อมูลครบ {data.coverage.succeeded}/{data.coverage.requested} {data.market.assetLabel}</em></div>
      <div className="backtest-funnel"><div><span>01 · STRUCTURE READY</span><strong>{data.funnel.structureReady}</strong><small>ครบ CHoCH → BOS → Pullback</small></div><i/><div><span>02 · MTF ALIGNED</span><strong>{data.funnel.mtfAligned}</strong><small>D1 / H4 / H1 เป็นขาขึ้น</small></div><i/><div className="passed"><span>03 · SCORE {score}+</span><strong>{data.funnel.scorePassed}</strong><small>ผ่านเกณฑ์ก่อนจัดพอร์ต</small></div></div>
      <div className="result-grid"><MetricCard label="จำนวนการทดสอบ" value={`${data.metrics.total}`} note={`${data.metrics.wins} ชนะ · ${data.metrics.losses} แพ้`}/><MetricCard label="Win Rate" value={`${fmt(data.metrics.winRate,1)}%`} note={`ชนะเฉลี่ย +${fmt(data.metrics.averageWin)}R`} tone={data.metrics.winRate >= 45 ? "good" : "warn"}/><MetricCard label="Profit Factor" value={fmt(data.metrics.profitFactor)} note={data.metrics.profitFactor >= 1.3 ? "ผ่านเกณฑ์เบื้องต้น" : "ยังไม่น่าสนใจ"} tone={data.metrics.profitFactor >= 1.3 ? "good" : "bad"}/><MetricCard label="Expectancy" value={`${data.metrics.expectancy >= 0 ? "+" : ""}${fmt(data.metrics.expectancy)}R`} note="ผลเฉลี่ยต่อ 1 รายการ" tone={data.metrics.expectancy > 0 ? "good" : "bad"}/><MetricCard label="ผลตอบแทนสะสม" value={`${data.metrics.netR >= 0 ? "+" : ""}${fmt(data.metrics.netR)}R`} note="คำนวณแบบเสี่ยงคงที่ 1R" tone={data.metrics.netR > 0 ? "good" : "bad"}/><MetricCard label="Max Drawdown" value={`-${fmt(data.metrics.maxDrawdown)}R`} note="การลดลงสูงสุดจากจุดสูงสุด" tone="bad"/></div>

      <div className="backtest-grid"><article className="equity-panel"><div className="backtest-panel-head"><div><p>EQUITY CURVE</p><h3>ผลตอบแทนสะสม (หน่วย R)</h3></div><span className={data.metrics.netR >= 0 ? "positive" : "negative"}>{data.metrics.netR >= 0 ? <TrendingUp/> : <TrendingDown/>}{data.metrics.netR >= 0 ? "+" : ""}{fmt(data.metrics.netR)}R</span></div><EquityChart points={data.metrics.equityCurve}/></article><article className="verdict-panel"><p>ENGINE VERDICT</p><h3>{data.metrics.total < 30 ? "จำนวนตัวอย่างยังน้อย" : data.metrics.expectancy > 0 && data.metrics.profitFactor >= 1.3 ? "กฎชุดนี้มี Edge เบื้องต้น" : "ยังไม่พบ Edge ที่ชัดเจน"}</h3><div className={`verdict-icon ${data.metrics.expectancy > 0 && data.metrics.profitFactor >= 1.3 ? "pass" : "fail"}`}>{data.metrics.expectancy > 0 && data.metrics.profitFactor >= 1.3 ? <CheckCircle2/> : <AlertTriangle/>}</div><p className="verdict-copy">{data.metrics.total < 30 ? "ควรลดคะแนนขั้นต่ำหรือเพิ่มช่วงเวลา เพื่อให้ได้อย่างน้อย 30–50 ตัวอย่าง" : data.metrics.expectancy > 0 && data.metrics.profitFactor >= 1.3 ? `กลุ่มที่เด่นที่สุดคือ ${bestSignal?.name ?? "—"} (${fmt(bestSignal?.expectancy ?? 0)}R/ครั้ง) แต่ยังควรทดสอบแบบ Out-of-sample ต่อ` : "อย่าเพิ่งเปิด Alert จริง ควรปรับกฎ Entry หรือเลือกเฉพาะสัญญาณที่ Expectancy เป็นบวก"}</p></article></div>

      <div className="backtest-grid lower"><article className="comparison-panel"><div className="backtest-panel-head"><div><p>SCORE THRESHOLD</p><h3>คะแนนสูงขึ้น ให้ผลดีขึ้นจริงไหม?</h3></div></div><div className="threshold-list">{data.comparisons.map(item => <div key={item.score} className={String(item.score) === score ? "active" : ""}><b>{item.score}+</b><span>{item.total} ครั้ง</span><strong className={item.expectancy >= 0 ? "positive" : "negative"}>{item.expectancy >= 0 ? "+" : ""}{fmt(item.expectancy)}R</strong><small>PF {fmt(item.profitFactor)} · WR {fmt(item.winRate,1)}%</small></div>)}</div></article><article className="signal-panel"><div className="backtest-panel-head"><div><p>ASSET BREAKDOWN</p><h3>{data.market.assetLabel}ที่มีผลทดสอบเด่น</h3></div></div><Table><TableHeader><TableRow><TableHead>สินทรัพย์</TableHead><TableHead className="text-right">ครั้ง</TableHead><TableHead className="text-right">Win rate</TableHead><TableHead className="text-right">Expectancy</TableHead></TableRow></TableHeader><TableBody>{data.byStock.slice(0,6).map(item=><TableRow key={item.name}><TableCell><b>{item.name}</b></TableCell><TableCell className="text-right">{item.total}</TableCell><TableCell className="text-right">{fmt(item.winRate,1)}%</TableCell><TableCell className={`text-right ${item.expectancy >= 0 ? "positive" : "negative"}`}>{item.expectancy >= 0 ? "+" : ""}{fmt(item.expectancy)}R</TableCell></TableRow>)}</TableBody></Table></article></div>

      <article className="trade-log-panel"><div className="backtest-panel-head"><div><p>RECENT CASES</p><h3>ตัวอย่างผลการทดสอบล่าสุด</h3></div><span>เข้าแท่งถัดไป · ไม่มี Look-ahead</span></div><div className="table-wrap"><Table><TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>สินทรัพย์</TableHead><TableHead>Setup</TableHead><TableHead className="text-center">Score</TableHead><TableHead className="text-right">Entry</TableHead><TableHead className="text-right">SL / TP</TableHead><TableHead className="text-right">ผลลัพธ์</TableHead></TableRow></TableHeader><TableBody>{data.recentTrades.map((trade,index)=><TableRow key={`${trade.symbol}-${trade.date}-${index}`}><TableCell>{new Date(trade.date).toLocaleDateString("th-TH",{day:"2-digit",month:"short",year:"2-digit"})}</TableCell><TableCell><b>{trade.symbol}</b></TableCell><TableCell><span className={`tag ${trade.signal.toLowerCase()}`}>{trade.signal}</span></TableCell><TableCell className="text-center"><span className="score high">{trade.score}</span></TableCell><TableCell className="text-right">{fmt(trade.entry)}</TableCell><TableCell className="text-right"><span className="negative">{fmt(trade.stop)}</span> / <span className="positive">{fmt(trade.target)}</span></TableCell><TableCell className={`text-right ${trade.resultR > 0 ? "positive" : "negative"}`}><b>{trade.resultR > 0 ? "+" : ""}{fmt(trade.resultR)}R</b></TableCell></TableRow>)}</TableBody></Table></div></article>
      <p className="backtest-disclaimer">ผลย้อนหลังไม่รับประกันผลในอนาคต · H4 สังเคราะห์จากแท่ง H1 ที่ปิดแล้ว · D1 ใช้เฉพาะวันก่อนหน้าเพื่อป้องกัน Look-ahead · Yahoo Finance เป็นข้อมูลอ้างอิงและยังไม่ควรใช้เป็นคำสั่งซื้อขายอัตโนมัติ</p>
    </>}
  </section>;
}
