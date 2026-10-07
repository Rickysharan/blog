type SiteIdentity = { name: string; url: string; publisher: string };
type WebsiteIdentity = SiteIdentity & { description: string; locale: string };

export type Breadcrumb = { name: string; path: string };

export function buildOrganizationJsonLd(site: SiteIdentity): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: site.publisher,
    alternateName: site.name,
    url: site.url,
    logo: {
      "@type": "ImageObject",
      url: `${site.url}/icons/icon-512.png`,
    },
  };
}

export function buildWebsiteJsonLd(site: WebsiteIdentity): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    name: site.name,
    alternateName: site.publisher,
    url: site.url,
    description: site.description,
    inLanguage: site.locale.replace("_", "-"),
    publisher: { "@id": `${site.url}/#organization` },
  };
}

export function buildBreadcrumbListJsonLd(
  site: SiteIdentity,
  breadcrumbs: readonly Breadcrumb[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((breadcrumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: breadcrumb.name,
      item: new URL(breadcrumb.path, `${site.url}/`).toString(),
    })),
  };
}
