"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";
import { ROLE_LABELS } from "@/lib/role-nav";
import type { Role } from "@/lib/auth";
import type { AdminUserRow } from "@/lib/operations";

const ROLES: Role[] = ["admin", "ceo", "estimator", "sales", "materials", "editor", "viewer", "crew"];

export default function UsersTable({ users, selfId }: { users: AdminUserRow[]; selfId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send(id: number, body: { role?: string; active?: number }) {
    setBusy(id);
    setErr(null);
    try {
      await post("/api/users/manage", { id, ...body });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(null);
    }
  }

  const pending = users.filter((u) => u.active === 0);
  const active = users.filter((u) => u.active === 1);

  return (
    <>
      {err && <div className="sub" style={{ color: "#b00020", marginTop: 8 }}>{err}</div>}

      {pending.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Pending approval · {pending.length}</h3>
          <table className="dtable">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th className="n"></th></tr>
            </thead>
            <tbody>
              {pending.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <RoleSelect user={u} busy={busy} onChange={(role) => send(u.id, { role })} />
                  </td>
                  <td className="n">
                    <button className="btn sm" disabled={busy === u.id} onClick={() => send(u.id, { active: 1 })}>
                      Activate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Active · {active.length}</h3>
        <table className="dtable">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th className="n"></th></tr>
          </thead>
          <tbody>
            {active.map((u) => {
              const isSelf = u.id === selfId;
              return (
                <tr key={u.id}>
                  <td>{u.name}{isSelf ? " (you)" : ""}</td>
                  <td>{u.email}</td>
                  <td>
                    <RoleSelect user={u} busy={busy} lock={isSelf} onChange={(role) => send(u.id, { role })} />
                  </td>
                  <td className="n">
                    <button
                      className="btn ghost sm"
                      disabled={busy === u.id || isSelf}
                      onClick={() => send(u.id, { active: 0 })}
                      title={isSelf ? "You can't deactivate your own account" : "Deactivate"}
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RoleSelect({
  user,
  busy,
  lock = false,
  onChange,
}: {
  user: AdminUserRow;
  busy: number | null;
  lock?: boolean;
  onChange: (role: string) => void;
}) {
  return (
    <select
      value={user.role}
      disabled={busy === user.id || lock}
      onChange={(e) => onChange(e.target.value)}
      title={lock ? "You can't change your own role" : "Set role"}
      style={{ cursor: lock ? "default" : "pointer" }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
      ))}
    </select>
  );
}
