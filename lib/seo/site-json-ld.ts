type SiteIdentity = { name: string; url: string; publisher: string };

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

