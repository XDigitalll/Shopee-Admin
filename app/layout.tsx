import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";

import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShopeeMz Admin",
  description: "Painel administrativo da Shopee X Digital",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className={`${sora.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
