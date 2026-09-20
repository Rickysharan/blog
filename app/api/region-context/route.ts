export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      countryCode: null,
      region: "global",
      source: "fallback",
    },
    {
      headers: {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
