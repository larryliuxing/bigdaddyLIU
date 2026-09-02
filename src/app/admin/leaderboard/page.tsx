import { redirect } from "next/navigation";
import { AdminLeaderboardPanel } from "@/components/leaderboard/AdminLeaderboardPanel";
import { getAdminSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLeaderboardPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/");
  }
  return <AdminLeaderboardPanel adminName={admin.username} />;
}
