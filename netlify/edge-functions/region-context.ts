import type { Context } from "@netlify/edge-functions";

import type { Region } from "@omnilede/contracts";

const REGION_COUNTRIES: Record<Exclude<Region, "global">, readonly string[]> = {
  africa: [
    "AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ", "DZ", "EG", "EH", "ER", "ET",
    "GA", "GH", "GM", "GN", "GQ", "GW", "KE", "KM", "LR", "LS", "LY", "MA", "MG", "ML", "MR", "MU", "MW",
    "MZ", "NA", "NE", "NG", "RW", "SC", "SD", "SL", "SN", "SO", "SS", "ST", "SZ", "TD", "TG", "TN", "TZ",
    "UG", "ZA", "ZM", "ZW",
  ],
  asia: [
    "AF", "BD", "BN", "BT", "CN", "HK", "ID", "IN", "JP", "KG", "KH", "KP", "KR", "KZ", "LA", "LK", "MM",
    "MN", "MO", "MV", "MY", "NP", "PH", "PK", "SG", "TH", "TJ", "TL", "TM", "TW", "UZ", "VN",
  ],
  europe: [
    "AD", "AL", "AM", "AT", "AZ", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FO", "FR", "GB", "GE", "GI", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD",
    "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "UA", "VA",
  ],
  "middle-east": ["AE", "BH", "IL", "IQ", "IR", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "YE"],
  "north-america": ["BM", "CA", "GL", "PM", "US"],
  "latin-america": [
    "AG", "AI", "AR", "AW", "BB", "BL", "BO", "BQ", "BR", "BS", "BZ", "CL", "CO", "CR", "CU", "CW", "DM",
    "DO", "EC", "FK", "GD", "GF", "GP", "GT", "GY", "HN", "HT", "JM", "KN", "KY", "LC", "MF", "MQ", "MS",
    "MX", "NI", "PA", "PE", "PR", "PY", "SR", "SV", "SX", "TC", "TT", "UY", "VC", "VE", "VG", "VI",
  ],
  oceania: ["AS", "AU", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU", "NZ", "PF", "PG", "PN", "PW", "SB", "TK", "TO", "TV", "VU", "WF", "WS"],
};

const COUNTRY_TO_REGION = new Map<string, Exclude<Region, "global">>(
  Object.entries(REGION_COUNTRIES).flatMap(([region, countries]) =>
    countries.map((country) => [country, region as Exclude<Region, "global">] as const),
  ),
);

function normalizeCountryCode(countryCode: string | null | undefined): string | null {
  const normalized = countryCode?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function mapCountryToRegion(countryCode: string | null | undefined): Region {
  const normalized = normalizeCountryCode(countryCode);
  return normalized ? COUNTRY_TO_REGION.get(normalized) ?? "global" : "global";
}

export default function regionContext(_request: Request, context: Context): Response {
  const candidate = normalizeCountryCode(context.geo?.country?.code);
  const region = mapCountryToRegion(candidate);
  const detected = candidate !== null && region !== "global";

  return new Response(
    JSON.stringify({
      countryCode: detected ? candidate : null,
      region,
      source: detected ? "netlify" : "fallback",
    }),
    {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/json; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
