import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MHP Field Log",
  description: "Quick job logging from the field",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

// Field layout: NO sidebar, NO desktop chrome. Full-screen mobile-first.
// This bypasses the main layout's sidebar wrapping.
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
