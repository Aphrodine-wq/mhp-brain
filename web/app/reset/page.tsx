import Link from "next/link";
import { redirect } from "next/navigation";
import { checkPasswordReset, currentUser } from "@/lib/auth";
import ResetForm from "./ResetForm";

export const metadata = { title: "Set a new password — MHP Brain" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await currentUser()) redirect("/");

  const { token } = await searchParams;
  // Validate up front so a dead link shows a clear message instead of a form that will only fail.
  const valid = token ? (await checkPasswordReset(token)) != null : false;

  if (!valid) {
    return (
      <div className="login-page">
        <div className="login-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-logo" src="/logo.png" alt="MHP Construction" />
          <h1 className="login-title">Link expired</h1>
          <p className="login-subtitle">This reset link is invalid or has already been used</p>
          <div className="login-alt">
            <Link href="/forgot">Request a new link</Link>
          </div>
          <div className="login-footer">North Mississippi Home Professionals</div>
        </div>
      </div>
    );
  }

  return <ResetForm token={token!} />;
}
