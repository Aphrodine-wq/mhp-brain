import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import SignupForm from "./SignupForm";

export const metadata = { title: "Create account — MHP Brain" };

export default async function SignupPage() {
  // Already signed in? No reason to be here.
  if (await currentUser()) redirect("/");
  return <SignupForm />;
}
