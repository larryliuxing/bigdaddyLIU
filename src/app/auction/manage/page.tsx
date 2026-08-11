import { redirect } from "next/navigation";
import { AuctionManagePanel } from "@/components/auction/AuctionManagePanel";
import { getAdminSession } from "@/lib/auth";
import { listMembers } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuctionManagePage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/");
  }
  return (
    <AuctionManagePanel
      initialMembers={listMembers()}
      adminName={admin.username}
    />
  );
}
