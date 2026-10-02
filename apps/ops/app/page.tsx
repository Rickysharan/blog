import { redirect } from "next/navigation";

import { requireStudioOperator } from "../lib/auth/operator";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let destination = "/overview";
  try {
    await requireStudioOperator();
  } catch {
    destination = "/login";
  }
  redirect(destination);
}
