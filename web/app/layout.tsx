import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "./_components/Sidebar";
import { currentUser } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "MHP Estimator",
  description: "North Mississippi Home Professionals — the estimating brain",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The shell (sidebar + chrome) only renders for a signed-in user; the /login page renders bare.
  const user = await currentUser();
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {user ? (
          <div className="app">
            <Sidebar user={user} />
            <main className="wrap">
              <div className="view-inner">{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
