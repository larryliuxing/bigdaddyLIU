export type MemberRole = "normal" | "officer" | "leader";

export interface Member {
  id: number;
  name: string;
  role: MemberRole;
  hasPassword: boolean;
  createdAt: string;
}

export interface MemberRow {
  id: number;
  name: string;
  role: MemberRole;
  password_hash: string | null;
  created_at: string;
}

export type SessionUser =
  | { type: "member"; id: number; name: string; role: MemberRole }
  | { type: "admin"; username: string };
