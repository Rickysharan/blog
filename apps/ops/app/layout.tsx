import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "OmniLede Operations",
  description: "A focused workspace for OmniLede operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
