export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import LogicConsole from "@/components/LogicConsole";

export default async function LogicPage() {
  try {
    await requirePrivilegedActor();
  } catch {
    redirect("/login");
  }

  return <LogicConsole />;
}
