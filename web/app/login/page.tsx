import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { googleAuthConfigured } from "@/lib/google-auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — MHP Estimator" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // Only allow local return paths (no open redirect to //evil.com).
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await currentUser()) redirect(dest);
  const showBypass = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_BUTTON === "1";
  return <LoginForm next={dest} dev={showBypass} google={googleAuthConfigured()} error={error ?? null} />;
}
