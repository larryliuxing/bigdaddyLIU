import { redirect } from "next/navigation";
import { AuctionRoom } from "@/components/auction/AuctionRoom";
import { buildRoomState } from "@/lib/auction/room";
import { getAdminSession, getMemberSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuctionPage() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    redirect("/");
  }
  const initialRoom = buildRoomState(undefined, {
    lite: true,
    includeDividends: true,
    includePriceStats: true,
    includeDividendReport: true,
    viewerMemberId: member?.id,
  });
  return <AuctionRoom member={member} initialRoom={initialRoom} />;
}
