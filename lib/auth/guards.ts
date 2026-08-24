import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export type Role = "STUDENT" | "UPLOADER" | "MODERATOR" | "ADMIN";

const roleOrder: Record<Role, number> = {
  STUDENT: 0,
  UPLOADER: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(minRole: Role) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userRole =
    (session.user as unknown as { role?: Role }).role ?? "STUDENT";
  if (roleOrder[userRole] < roleOrder[minRole]) {
    redirect("/");
  }
  return session;
}

export async function getSession() {
  return await auth();
}
