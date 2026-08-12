import { redirect } from "next/navigation";
import { AdminBossPanel } from "@/components/boss/AdminBossPanel";
import { getAdminSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminBossPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/");
  }
  return <AdminBossPanel adminName={admin.username} />;
}
