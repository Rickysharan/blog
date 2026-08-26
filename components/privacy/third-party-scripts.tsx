"use client";

import { useEffect } from "react";

function validGa4Id(value: string | undefined): value is string {
  return Boolean(value && /^G-[A-Z0-9-]+$/i.test(value));
}

function validAdsenseClient(value: string | undefined): value is string {
  return Boolean(value && /^ca-pub-[A-Z0-9-]+$/i.test(value));
}

function appendExternalScript(id: string, src: string): void {
  if (document.getElementById(id)) {
    return;
  }
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  script.crossOrigin = "anonymous";
  document.head.append(script);
}

function appendInlineScript(id: string, source: string): void {
  if (document.getElementById(id)) {
    return;
  }
  const script = document.createElement("script");
  script.id = id;
  script.textContent = source;
  document.head.append(script);
}

const SCRIPT_IDS = [
  "omnilede-ga4-library",
  "omnilede-ga4-config",
  "omnilede-adsense-library",
];

export function ThirdPartyScripts({
  ga4Id,
  adsenseClientId,
  adsenseEnabled,
}: {
  ga4Id?: string;
  adsenseClientId?: string;
  adsenseEnabled: boolean;
}) {
  useEffect(() => {
    if (validGa4Id(ga4Id)) {
      appendExternalScript(
        "omnilede-ga4-library",
        `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`,
      );
      appendInlineScript(
        "omnilede-ga4-config",
        `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(ga4Id)},{anonymize_ip:true});`,
      );
    }
    if (adsenseEnabled && validAdsenseClient(adsenseClientId)) {
      appendExternalScript(
        "omnilede-adsense-library",
        `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClientId)}`,
      );
    }

    return () => {
      for (const id of SCRIPT_IDS) {
        document.getElementById(id)?.remove();
      }
    };
  }, [adsenseClientId, adsenseEnabled, ga4Id]);

  return null;
}
