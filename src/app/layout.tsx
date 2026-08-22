import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three typefaces, each with a defined job.
 *
 * Inter        interface text, tables, labels, forms
 * Source Serif institutional headings, the voice of a financial institution
 * Geist Mono   identifiers: claim IDs, case numbers, parcel numbers
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Duequity | Recover what is rightfully yours",
    template: "%s | Duequity",
  },
  description:
    "Duequity helps former property owners and heirs identify and recover surplus funds that may still legally belong to them after a foreclosure, tax sale, or similar property sale.",
  applicationName: "Duequity",
  authors: [{ name: "Westforge Holdings Inc." }],
  openGraph: {
    title: "Duequity | Recover what is rightfully yours",
    description:
      "A national property surplus recovery and claims coordination platform by Westforge Holdings Inc.",
    siteName: "Duequity",
    type: "website",
  },
  formatDetection: {
    telephone: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom is never blocked. Former homeowners include older claimants reading
  // legal documents on a phone.
  maximumScale: 5,
  themeColor: "#0c1015",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink-800">
        {children}
      </body>
    </html>
  );
}
