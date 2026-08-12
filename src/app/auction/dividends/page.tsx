import { redirect } from "next/navigation";
import { DividendPanel } from "@/components/auction/DividendPanel";
import { getAdminSession, getMemberSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuctionDividendsPage() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    redirect("/");
  }
  return <DividendPanel member={member} />;
}
