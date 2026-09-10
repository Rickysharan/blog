import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OmniLede Contributor",
    short_name: "OmniLede",
    description: "A focused workspace for global contributors.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f2eb",
    theme_color: "#111111",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
