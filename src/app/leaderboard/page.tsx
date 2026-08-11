import { redirect } from "next/navigation";
import { LeaderboardPanel } from "@/components/leaderboard/LeaderboardPanel";
import { getAdminSession, getMemberSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    redirect("/");
  }
  return <LeaderboardPanel member={member} isAdmin={Boolean(admin)} />;
}
