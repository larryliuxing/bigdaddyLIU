import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";
import { getSession } from "@/lib/auth";
import { listMembers } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.type !== "admin") {
    redirect("/");
  }

  const members = listMembers();
  return <AdminPanel initialMembers={members} adminName={session.username} />;
}
