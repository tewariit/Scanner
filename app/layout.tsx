import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MARKETPULSE — Global Technical Scanner",
  description: "แดชบอร์ดสแกนหุ้นไทย หุ้นโลก ETF คริปโต และหุ้นปันผล ด้วยกฎ Multi-Timeframe พร้อม Global Pulse",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
