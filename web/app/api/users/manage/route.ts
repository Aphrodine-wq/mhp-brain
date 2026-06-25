import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { updateUserAdmin, USER_ROLES, OpsError, type UserRole } from "@/lib/operations";

// POST {id, role?, active?} — admin-only. Activate/deactivate a user or change their role.
// Mirrors the write-back contract (web/AGENTS.md): role gate, server-side actor, value
// validation, audited mutation. Sign-ups land active=0/viewer (lib/auth.createPendingUser);
// this is the only in-app way to let them in.
export async function POST(req: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "admin session required" }, { status: 401 });

  let d: { id?: unknown; role?: unknown; active?: unknown };
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const id = Number(d.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const updates: { role?: UserRole; active?: 0 | 1 } = {};
  if (d.role !== undefined) {
    if (!USER_ROLES.includes(d.role as UserRole)) return NextResponse.json({ error: "bad role" }, { status: 400 });
    updates.role = d.role as UserRole;
  }
  if (d.active !== undefined) {
    const a = Number(d.active);
    if (a !== 0 && a !== 1) return NextResponse.json({ error: "bad active" }, { status: 400 });
    updates.active = a as 0 | 1;
  }
  if (updates.role === undefined && updates.active === undefined) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  // Self-lockout guard: an admin can't deactivate or demote their own account — that could
  // orphan the only way back in. Use a second admin account to change this one.
  if (id === admin.id && (updates.active === 0 || (updates.role !== undefined && updates.role !== "admin"))) {
    return NextResponse.json({ error: "can't demote or deactivate your own admin account" }, { status: 400 });
  }

  try {
    await updateUserAdmin(id, updates, admin.name);
  } catch (e) {
    if (e instanceof OpsError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
