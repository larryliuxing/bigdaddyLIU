"use client";

/** Shared navigation after scoped logout. */
export async function logoutAndRedirect(
  scope: "member" | "admin" | "all",
  router: { push: (href: string) => void; refresh: () => void },
) {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  const data = await res.json().catch(() => ({}));
  const member = Boolean(data?.member);
  const admin = Boolean(data?.admin);
  if (member) router.push("/home");
  else if (admin) router.push("/admin");
  else router.push("/");
  router.refresh();
}

export function hubPath(hasMember: boolean, isAdmin: boolean) {
  if (hasMember) return "/home";
  if (isAdmin) return "/admin";
  return "/";
}
