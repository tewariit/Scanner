type TradingViewLogoRow = {
  s?: string;
  d?: [string | null, string | null];
};

type TradingViewLogoResponse = {
  data?: TradingViewLogoRow[];
};

const logoBaseUrl = "https://s3-symbol-logo.tradingview.com";

function logoUrl(logoid: string) {
  const safePath = logoid.split("/").map(encodeURIComponent).join("/");
  return `${logoBaseUrl}/${safePath}--big.svg`;
}

export async function GET() {
  try {
    const response = await fetch("https://scanner.tradingview.com/thailand/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        filter: [{ left: "exchange", operation: "equal", right: "SET" }],
        options: { lang: "en" },
        markets: ["thailand"],
        symbols: { query: { types: [] }, tickers: [] },
        columns: ["name", "logoid"],
        range: [0, 1200],
      }),
    });
    if (!response.ok) throw new Error(`logo index ${response.status}`);
    const payload = await response.json() as TradingViewLogoResponse;
    const logos = Object.fromEntries((payload.data ?? []).flatMap((row) => {
      const symbol = row.s?.split(":").at(-1)?.replace(/\.R$/, "");
      const logoid = row.d?.[1];
      return symbol && logoid ? [[symbol, logoUrl(logoid)]] : [];
    }));
    return Response.json({ logos, count: Object.keys(logos).length }, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "logo index unavailable";
    return Response.json({ logos: {}, count: 0, error: message }, {
      status: 503,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  }
}
