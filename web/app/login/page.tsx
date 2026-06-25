import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — MHP Brain" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await currentUser()) redirect(dest);
  // Dev-only bypass — never renders in production (mirrors /api/dev-login's own gate).
  const showBypass = process.env.NODE_ENV !== "production";
  return (
    <LoginForm
      next={dest}
      dev={showBypass}
      error={error ?? null}
    />
  );
}
