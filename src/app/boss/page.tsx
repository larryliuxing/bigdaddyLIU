import { redirect } from "next/navigation";
import { BossTimerPanel } from "@/components/boss/BossTimerPanel";
import { getAdminSession, getMemberSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BossPage() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    redirect("/");
  }
  return <BossTimerPanel member={member} />;
}
