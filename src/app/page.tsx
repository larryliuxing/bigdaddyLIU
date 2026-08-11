import { redirect } from "next/navigation";
import { IdentitySelect } from "@/components/IdentitySelect";
import { getSession } from "@/lib/auth";
import { listMembers } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.type === "member") {
    redirect("/home");
  }
  if (session?.type === "admin") {
    redirect("/admin");
  }

  const members = listMembers();
  return <IdentitySelect members={members} />;
}
