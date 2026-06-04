import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "./_components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "MHP Estimator",
  description: "North Mississippi Home Professionals — the estimating brain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="app">
          <Sidebar />
          <main className="wrap">
            <div className="view-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
