import type { Metadata } from "next";
import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import "./globals.css";

export const metadata: Metadata = {
  title: "Payment Matcher",
  description: "Finds payments recorded against the wrong invoice before anyone chases a customer who already paid.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/findings" className="brand">
              Payment Matcher
            </Link>
            <nav className="nav">
              <Link href="/findings">Findings</Link>
              <Link href="/review">Review queue</Link>
              <Link href="/email">Check an email</Link>
            </nav>
            <span className="asof">
              {ledger.business} · ledger as of {ledger.asOf}
            </span>
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
