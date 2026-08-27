import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import Script from "next/script";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { IosInstallBanner } from "@/components/pwa/ios-install-banner";
import { InstallProvider } from "@/components/pwa/install-provider";
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
  applicationName: SITE_CONFIG.name,
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: SITE_CONFIG.name,
    statusBarStyle: "default",
    startupImage: [
      { url: "/splash/apple-splash-1170-2532.png", media: "(device-width: 390px)" },
      { url: "/splash/apple-splash-1290-2796.png", media: "(device-width: 430px)" },
    ],
  },
  alternates: {
    canonical: SITE_CONFIG.url,
    types: { "application/rss+xml": `${SITE_CONFIG.url}/feed.xml` },
  },
  openGraph: {
    type: "website",
    siteName: SITE_CONFIG.name,
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.url,
    locale: SITE_CONFIG.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#071723" },
    { media: "(prefers-color-scheme: dark)", color: "#030d15" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable}`}
      data-scroll-behavior="smooth"
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
          <InstallProvider>
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <SiteHeader />
            {children}
            <SiteFooter />
            <IosInstallBanner />
          </InstallProvider>
        </ConsentManager>
      </body>
    </html>
  );
}
