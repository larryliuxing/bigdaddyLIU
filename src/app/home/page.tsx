import { redirect } from "next/navigation";
import { HomeHub } from "@/components/HomeHub";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session || session.type !== "member") {
    redirect("/");
  }
  return <HomeHub user={session} />;
}
