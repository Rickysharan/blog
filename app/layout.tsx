import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import Script from "next/script";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ConsentManager } from "@/components/privacy/consent-manager";
import { THEME_BOOTSTRAP } from "@/components/theme/theme-script";
import { SITE_CONFIG } from "@/lib/config/site";

import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: {
    default: SITE_CONFIG.name,
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: SITE_CONFIG.description,
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2e9" },
    { media: "(prefers-color-scheme: dark)", color: "#111516" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script id="omnilede-theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP}
        </Script>
        <ConsentManager
          adsenseClientId={process.env.ADSENSE_CLIENT_ID}
          adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
          ga4Id={process.env.GA4_ID}
        >
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <SiteHeader />
          {children}
          <SiteFooter />
        </ConsentManager>
      </body>
    </html>
  );
}
