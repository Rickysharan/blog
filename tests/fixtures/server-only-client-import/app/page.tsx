"use client";

import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export default function InvalidServerOnlyClientImport() {
  return <p>{typeof createSupabaseAdminClient}</p>;
}
