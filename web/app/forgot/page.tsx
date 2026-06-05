import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ForgotForm from "./ForgotForm";

export const metadata = { title: "Reset password — MHP Brain" };

export default async function ForgotPage() {
  if (await currentUser()) redirect("/");
  return <ForgotForm />;
}
