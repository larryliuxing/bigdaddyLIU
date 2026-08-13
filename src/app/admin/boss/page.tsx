import { redirect } from "next/navigation";
import { AdminBossPanel } from "@/components/boss/AdminBossPanel";
import { getAdminSession } from "@/lib/auth";
import { listBosses } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminBossPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/");
  }
  const initialBosses = listBosses(true, { includeImages: false });
  return (
    <AdminBossPanel
      adminName={admin.username}
      initialBosses={initialBosses}
    />
  );
}
