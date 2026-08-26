import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thai Stock Scanner",
  description: "แดชบอร์ดสแกนหุ้นไทยเชิงเทคนิค พร้อมคะแนน สัญญาณ และกราฟราคา",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
