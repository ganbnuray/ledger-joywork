import type { Metadata } from "next";
import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { MATCHER_VERSION, versionNote } from "@/src/matcher/versions";
import { viewedVersion } from "@/src/view/version";
import { VersionSwitcher } from "./VersionSwitcher";
import { NavLinks } from "./NavLinks";
import { setViewedVersion } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Payment Matcher",
  description: "Finds payments recorded against the wrong invoice before anyone chases a customer who already paid.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The switcher needs the database. If it is not reachable, the pages show their own error.
  const viewed = await viewedVersion(ledger).catch(() => null);
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/findings" className="brand">
              Payment Matcher
            </Link>
            <NavLinks />
            {viewed && <VersionSwitcher versions={viewed.all} current={MATCHER_VERSION} viewed={viewed.version} />}
          </div>
        </header>
        {viewed && !viewed.isCurrent && (
          <div className="old-version">
            <div className="old-version-inner">
              <span>
                <strong>Viewing version {viewed.version}.</strong> Findings are shown as this version gave them, with your
                manual reviews. Reviewing is off here. {versionNote(viewed.version)}
              </span>
              <form action={setViewedVersion}>
                <input type="hidden" name="version" value={MATCHER_VERSION} />
                <button type="submit" className="secondary">
                  Back to version {MATCHER_VERSION}
                </button>
              </form>
            </div>
          </div>
        )}
        <main className="page">{children}</main>
        <footer className="footer">
          {ledger.business} · ledger as of {ledger.asOf}
        </footer>
      </body>
    </html>
  );
}
