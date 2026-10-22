import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Narrow, Courier_Prime } from "next/font/google";

import "./globals.css";

/*
 * Three faces, each with a job, matching how a real form is made: captions engraved on
 * the stock in advance, data struck in later with a ribbon.
 */

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const archivoNarrow = Archivo_Narrow({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-archivo-narrow",
  display: "swap",
});

const courier = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-courier",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vamo Ops Radar — delivery exception manifest",
  description:
    "A ranked queue of the deliveries about to fail, with the reason and the next move already on the row.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2efe6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} ${archivoNarrow.variable} ${courier.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
