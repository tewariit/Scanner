"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

type Candle = { time?: number; open: number; high: number; low: number; close: number; volume?: number };
type ChartStock = { symbol: string; price: number; target: number; stop: number; seed?: number; candles?: Candle[] };

function price(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: value < 100 ? 2 : value % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function compactVolume(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

function emaSeries(candles: Candle[], period: number) {
  const k = 2 / (period + 1);
  let ema = candles[0]?.close ?? 0;
  return candles.map((candle, index) => {
    ema = index === 0 ? candle.close : candle.close * k + ema * (1 - k);
    return ema;
  });
}

function demoSeries(stock: ChartStock) {
  const count = 180;
  const scale = stock.price * .006;
  return Array.from({ length: count }, (_, index) => {
    const seed = stock.seed ?? 1;
    const wave = Math.sin((index + seed) * .42) * scale + Math.cos((index + seed) * .13) * scale * .8;
    const drift = (index - count) * scale * .055;
    const close = stock.price + wave + drift;
    const open = close - Math.sin((index + seed) * 1.17) * scale * .7;
    return { time: Math.floor(Date.now() / 1000) - (count - index) * 3600, open, close, high: Math.max(open, close) + scale * .65, low: Math.min(open, close) - scale * .65, volume: 500_000 + ((index * 7919) % 1_300_000) };
  });
}

function requestedCount(range: string, timeframe: string) {
  if (timeframe === "day") return ({ "1D": 20, "1W": 40, "1M": 80, "3M": 180 } as Record<string, number>)[range] ?? 80;
  if (timeframe === "15m") return ({ "1D": 28, "1W": 90, "1M": 180, "3M": 300 } as Record<string, number>)[range] ?? 180;
  return ({ "1D": 8, "1W": 35, "1M": 125, "3M": 320 } as Record<string, number>)[range] ?? 125;
}

export function TradingChart({ stock, range, timeframe }: { stock: ChartStock; range: string; timeframe: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; end: number } | null>(null);
  const [width, setWidth] = useState(760);
  const [view, setView] = useState({ count: 80, end: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const data = useMemo(() => stock.candles?.length ? stock.candles : demoSeries(stock), [stock]);
  const ema20 = useMemo(() => emaSeries(data, 20), [data]);
  const ema50 = useMemo(() => emaSeries(data, 50), [data]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setView({ count: Math.min(data.length, requestedCount(range, timeframe)), end: data.length });
    setHovered(null);
    setCrosshair(null);
  }, [data, range, timeframe, stock.symbol]);

  const height = width < 560 ? 330 : 430;
  const left = 12, right = 68, top = 34, priceBottom = height - 102, volumeTop = height - 84, volumeBottom = height - 30;
  const count = Math.max(1, Math.min(view.count, data.length));
  const end = Math.max(count, Math.min(view.end || data.length, data.length));
  const start = Math.max(0, end - count);
  const visible = data.slice(start, end);
  const highs = visible.map((candle) => candle.high);
  const lows = visible.map((candle) => candle.low);
  const rawMin = Math.min(...lows), rawMax = Math.max(...highs);
  const padding = Math.max((rawMax - rawMin) * .08, rawMax * .002);
  const min = rawMin - padding, max = rawMax + padding;
  const plotWidth = width - left - right;
  const step = plotWidth / Math.max(1, visible.length);
  const y = (value: number) => top + (max - value) / Math.max(.0001, max - min) * (priceBottom - top);
  const x = (index: number) => left + index * step + step / 2;
  const maxVolume = Math.max(1, ...visible.map((candle) => candle.volume ?? 0));
  const linePoints = (values: number[]) => values.slice(start, end).map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const active = hovered == null ? visible.at(-1) : visible[hovered];
  const activeIndex = hovered == null ? visible.length - 1 : hovered;
  const change = active && active.open ? (active.close / active.open - 1) * 100 : 0;

  function zoom(delta: number) {
    setView((current) => ({ ...current, count: Math.max(12, Math.min(data.length, current.count + delta)) }));
  }

  function pointerPosition(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = pointerPosition(event);
    if (dragRef.current) {
      const bars = Math.round((dragRef.current.x - point.x) / Math.max(1, step));
      setView((current) => ({ ...current, end: Math.max(current.count, Math.min(data.length, dragRef.current!.end + bars)) }));
    }
    if (point.x >= left && point.x <= width - right && point.y >= top && point.y <= volumeBottom) {
      setHovered(Math.max(0, Math.min(visible.length - 1, Math.floor((point.x - left) / step))));
      setCrosshair(point);
    }
  }

  function onWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoom(event.deltaY > 0 ? Math.max(2, Math.round(count * .12)) : -Math.max(2, Math.round(count * .12)));
  }

  const timeLabel = (candle?: Candle) => candle?.time ? new Date(candle.time * 1000).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", hour: timeframe === "day" ? undefined : "2-digit", minute: timeframe === "day" ? undefined : "2-digit" }) : "—";

  return <div className="tv-chart" ref={containerRef}>
    <div className="tv-chart-head">
      <div className="tv-ohlc"><b>{stock.symbol}</b><span>O <i>{price(active?.open ?? 0)}</i></span><span>H <i>{price(active?.high ?? 0)}</i></span><span>L <i>{price(active?.low ?? 0)}</i></span><span>C <i>{price(active?.close ?? 0)}</i></span><strong className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</strong></div>
      <div className="tv-tools"><button onClick={() => zoom(Math.max(2, Math.round(count * .18)))} aria-label="ซูมออก"><Minus/></button><button onClick={() => zoom(-Math.max(2, Math.round(count * .18)))} aria-label="ซูมเข้า"><Plus/></button><button onClick={() => setView({ count: Math.min(data.length, requestedCount(range, timeframe)), end: data.length })} aria-label="รีเซ็ตกราฟ"><RotateCcw/></button></div>
    </div>
    <div className="tv-legend"><span><i className="candle"/>Candles</span><span><i className="ema20"/>EMA20 <b>{price(ema20[start + activeIndex] ?? 0)}</b></span><span><i className="ema50"/>EMA50 <b>{price(ema50[start + activeIndex] ?? 0)}</b></span><span><i className="volume"/>Volume <b>{compactVolume(active?.volume ?? 0)}</b></span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`กราฟแท่งเทียนแบบโต้ตอบของ ${stock.symbol}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = pointerPosition(event); dragRef.current = { x: point.x, end }; }} onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onPointerLeave={() => { if (!dragRef.current) { setHovered(null); setCrosshair(null); } }} onWheel={onWheel}>
      <rect width={width} height={height} fill="#0e151b"/>
      {Array.from({ length: 6 }, (_, index) => {
        const value = max - index / 5 * (max - min); const gy = y(value);
        return <g key={index}><line x1={left} x2={width-right} y1={gy} y2={gy} stroke="#28333c" strokeDasharray="3 5"/><text x={width-right+9} y={gy+4} fill="#73808a" fontSize="10">{price(value)}</text></g>;
      })}
      {Array.from({ length: 6 }, (_, index) => { const gx = left + index / 5 * plotWidth; return <line key={index} x1={gx} x2={gx} y1={top} y2={volumeBottom} stroke="#202a32" strokeDasharray="2 6"/>; })}
      {visible.map((candle, index) => {
        const up = candle.close >= candle.open; const color = up ? "#26a69a" : "#ef5350"; const cx = x(index); const bodyWidth = Math.max(2, Math.min(18, step * .72));
        return <g key={`${candle.time ?? index}-${index}`}><line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1"/><rect x={cx-bodyWidth/2} y={Math.min(y(candle.open),y(candle.close))} width={bodyWidth} height={Math.max(1,Math.abs(y(candle.open)-y(candle.close)))} fill={color}/><rect x={cx-bodyWidth/2} y={volumeBottom-(candle.volume ?? 0)/maxVolume*(volumeBottom-volumeTop)} width={bodyWidth} height={(candle.volume ?? 0)/maxVolume*(volumeBottom-volumeTop)} fill={color} opacity=".28"/></g>;
      })}
      <polyline points={linePoints(ema20)} fill="none" stroke="#f4b942" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
      <polyline points={linePoints(ema50)} fill="none" stroke="#7c83ff" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
      <line x1={left} x2={width-right} y1={volumeTop-7} y2={volumeTop-7} stroke="#28333c"/>
      {stock.target >= min && stock.target <= max && <g><line x1={left} x2={width-right} y1={y(stock.target)} y2={y(stock.target)} stroke="#9bf526" strokeDasharray="5 5" opacity=".45"/><text x={left+5} y={y(stock.target)-5} fill="#9bf526" fontSize="8">TARGET {price(stock.target)}</text></g>}
      {stock.stop >= min && stock.stop <= max && <g><line x1={left} x2={width-right} y1={y(stock.stop)} y2={y(stock.stop)} stroke="#ff667d" strokeDasharray="5 5" opacity=".45"/><text x={left+5} y={y(stock.stop)-5} fill="#ff667d" fontSize="8">STOP {price(stock.stop)}</text></g>}
      <g><line x1={left} x2={width-right} y1={y(stock.price)} y2={y(stock.price)} stroke="#9bf526" strokeDasharray="2 3" opacity=".7"/><rect x={width-right+3} y={y(stock.price)-10} width={right-7} height="20" rx="3" fill="#9bf526"/><text x={width-right+(right-4)/2} y={y(stock.price)+4} textAnchor="middle" fill="#10170b" fontSize="10" fontWeight="800">{price(stock.price)}</text></g>
      {[0,.25,.5,.75,1].map((ratio) => { const index = Math.min(visible.length-1,Math.round((visible.length-1)*ratio)); return <text key={ratio} x={x(index)} y={height-10} textAnchor="middle" fill="#65727c" fontSize="9">{timeLabel(visible[index])}</text>; })}
      {crosshair && hovered != null && <g pointerEvents="none"><line x1={crosshair.x} x2={crosshair.x} y1={top} y2={volumeBottom} stroke="#7d8b95" strokeDasharray="4 4" opacity=".75"/><line x1={left} x2={width-right} y1={crosshair.y} y2={crosshair.y} stroke="#7d8b95" strokeDasharray="4 4" opacity=".75"/><rect x={width-right+3} y={Math.max(top,crosshair.y-9)} width={right-7} height="18" rx="2" fill="#394650"/><text x={width-right+(right-4)/2} y={Math.max(top+12,crosshair.y+4)} textAnchor="middle" fill="#edf1f4" fontSize="9">{price(max-(crosshair.y-top)/(priceBottom-top)*(max-min))}</text><rect x={Math.max(left,Math.min(width-right-104,crosshair.x-52))} y={height-25} width="104" height="18" rx="2" fill="#394650"/><text x={Math.max(left+52,Math.min(width-right-52,crosshair.x))} y={height-12} textAnchor="middle" fill="#edf1f4" fontSize="8">{timeLabel(visible[hovered])}</text></g>}
    </svg>
    <div className="tv-hint">ลากเพื่อเลื่อน · หมุนเมาส์หรือกด +/− เพื่อซูม</div>
  </div>;
}
