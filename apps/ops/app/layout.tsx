import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "OmniLede Studio",
    template: "%s | OmniLede Studio"
  },
  description: "The private OmniLede newsroom control plane.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "OmniLede Studio",
    statusBarStyle: "black-translucent"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
