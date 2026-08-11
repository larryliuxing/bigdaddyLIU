import { redirect } from "next/navigation";
import { AuctionHistory } from "@/components/auction/AuctionHistory";
import { getAdminSession, getMemberSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuctionHistoryPage() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    redirect("/");
  }
  return <AuctionHistory />;
}
