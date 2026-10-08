import {
  ADSENSE_PUBLISHER_ID_PATTERN,
  OMNILEDE_ADSENSE_PUBLISHER_ID,
} from "@/lib/config/commercial";

const GOOGLE_SELLER_DOMAIN = "google.com";
const GOOGLE_CERTIFICATION_AUTHORITY_ID = "f08c47fec0942fa0";

function adsTxtRecord(publisherId: string | undefined): string | null {
  if (!publisherId || !ADSENSE_PUBLISHER_ID_PATTERN.test(publisherId)) return null;
  return `${GOOGLE_SELLER_DOMAIN}, ${publisherId}, DIRECT, ${GOOGLE_CERTIFICATION_AUTHORITY_ID}\n`;
}

export async function GET() {
  const record = adsTxtRecord(
    process.env.ADSENSE_PUBLISHER_ID === undefined
      ? OMNILEDE_ADSENSE_PUBLISHER_ID
      : process.env.ADSENSE_PUBLISHER_ID,
  );
  if (!record) return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  return new Response(record, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
