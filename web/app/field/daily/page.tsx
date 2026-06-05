import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import DailyFlow from "./DailyFlow";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <DailyFlow userName={user.name} />;
}
