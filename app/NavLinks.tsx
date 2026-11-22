"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/findings", label: "Findings" },
  { href: "/review", label: "Review queue" },
  { href: "/email", label: "Check an email" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/versions", label: "Versions" },
];

// The top bar links. The page you are on is shown in the text color, the others in grey.
export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "active" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
