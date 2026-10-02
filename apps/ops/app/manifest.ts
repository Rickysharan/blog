import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OmniLede Studio",
    short_name: "Studio",
    description: "The private OmniLede newsroom control plane.",
    start_url: "/overview",
    display: "standalone",
    background_color: "#f3efe5",
    theme_color: "#173f35",
    lang: "en",
    icons: [
      { src: "/icons/studio-icon-v1.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/studio-maskable-v1.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
