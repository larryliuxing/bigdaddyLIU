import { redirect } from "next/navigation";
import { AuctionRoom } from "@/components/auction/AuctionRoom";
import { getAdminSession, getMemberSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuctionPage() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    redirect("/");
  }
  return <AuctionRoom member={member} isAdmin={Boolean(admin)} />;
}
