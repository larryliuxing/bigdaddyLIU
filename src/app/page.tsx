import { redirect } from "next/navigation";
import { IdentitySelect } from "@/components/IdentitySelect";
import { getAdminSession, getMemberSession } from "@/lib/auth";
import { listMembers } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  const params = await searchParams;
  const forceSwitch = params.switch === "1";

  if (!forceSwitch) {
    const member = await getMemberSession();
    if (member) {
      redirect("/home");
    }
    const admin = await getAdminSession();
    if (admin) {
      redirect("/admin");
    }
  }

  const members = listMembers();
  return <IdentitySelect members={members} />;
}
