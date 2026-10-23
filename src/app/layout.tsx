import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";

import "./globals.css";

/*
 * Two faces. Archivo carries the interface; the mono carries anything the operator reads
 * as a value rather than as prose — refs, route codes, clocks, scores — where tabular
 * figures and a slashed zero stop a misread.
 */

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vamo Ops Desk — issue queue",
  description:
    "Every issue reaching the ops team, ranked, with the context already assembled and the reply drafted.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e13" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
