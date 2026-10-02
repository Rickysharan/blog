import { redirect } from "next/navigation";

import { StudioShell } from "../../components/studio-shell";
import { requireStudioOperator } from "../../lib/auth/operator";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let operatorEmail: string;
  try {
    operatorEmail = (await requireStudioOperator()).email;
  } catch {
    redirect("/login");
  }

  return <StudioShell operatorEmail={operatorEmail}>{children}</StudioShell>;
}
