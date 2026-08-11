import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";
import { getAdminSession } from "@/lib/auth";
import { listMembers } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/");
  }

  const members = listMembers();
  return <AdminPanel initialMembers={members} adminName={session.username} />;
}
