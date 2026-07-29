import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The builder moved into /estimates. Keep old handoff links
// (/estimate-builder?scope=…&sqft=…&client=…) working by landing on /estimates
// in builder mode (?new=1) with the prefill params preserved.
export default async function EstimateBuilderRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
  }
  q.set("new", "1");
  redirect(`/estimates?${q.toString()}`);
}
