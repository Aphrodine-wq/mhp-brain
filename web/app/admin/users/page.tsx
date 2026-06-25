import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listUsers } from "@/lib/operations";
import UsersTable from "./UsersTable";

export const dynamic = "force-dynamic";

// Admin-only user management: activate pending sign-ups, set roles, deactivate accounts.
// The save endpoint (POST /api/users/manage) is admin-gated; this page mirrors that gate so
// a non-admin never sees controls that would just 401.
export default async function AdminUsersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    return (
      <section className="view">
        <h2>Users</h2>
        <div className="sub">Only admins can manage users.</div>
      </section>
    );
  }

  const users = await listUsers();
  return (
    <section className="view">
      <h2>Users</h2>
      <div className="sub">Activate pending sign-ups and set roles. Every change is recorded in the audit log.</div>
      <UsersTable users={users} selfId={user.id} />
    </section>
  );
}
