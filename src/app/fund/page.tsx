import { redirect } from "next/navigation";
import { GuildFundPanel } from "@/components/GuildFundPanel";
import { getAdminSession, getMemberSession } from "@/lib/auth";
import { getGuildFund } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuildFundPage() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    redirect("/");
  }
  return (
    <GuildFundPanel
      member={member}
      isAdmin={Boolean(admin)}
      initialFund={getGuildFund()}
    />
  );
}
