import type { Metadata, Viewport } from "next";
import { Nunito, DM_Sans } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700", "800", "900"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  themeColor: "#f43f5e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Stuby AI ✨ | Belajar Bareng Sabby",
  description:
    "Ubah PDF membosankan jadi rangkuman cerdas, kuis interaktif, dan flashcard — otomatis dengan AI.",
  keywords: ["Stuby AI", "Belajar AI", "Kuis Otomatis", "Flashcard AI", "Rangkuman PDF"],
  authors: [{ name: "Stuby AI" }],
  openGraph: {
    title: "Stuby AI ✨",
    description: "Belajar lebih smart, bukan lebih keras.",
    siteName: "Stuby AI",
    locale: "id_ID",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`${nunito.variable} ${dmSans.variable} h-full scroll-smooth`}
    >
      <body className="min-h-full flex flex-col bg-[#fff5f8] text-gray-900 antialiased selection:bg-pink-200 selection:text-pink-900">
        {children}
      </body>
    </html>
  );
}