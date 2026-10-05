import { redirect } from "next/navigation";
import { HomeHub } from "@/components/HomeHub";
import { getMemberSession } from "@/lib/auth";
import { getGuildFund } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getMemberSession();
  if (!session) {
    redirect("/");
  }
  return <HomeHub user={session} fund={getGuildFund()} />;
}
