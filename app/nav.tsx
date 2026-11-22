"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// A table row that opens a page when clicked anywhere.
// Links and buttons inside the row keep working, and selecting text does not navigate.
export function ClickableRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="link-row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, select")) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

function typingInField(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

// Previous and next links between findings, also on the left and right arrow keys.
export function Pager({
  prevHref,
  nextHref,
  prevLabel,
  nextLabel,
  position,
}: {
  prevHref: string | null;
  nextHref: string | null;
  prevLabel: string | null;
  nextLabel: string | null;
  position: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (typingInField() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prevHref) router.push(prevHref);
      if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);

  return (
    <div className="pager">
      {prevHref ? (
        <Link href={prevHref} className="button secondary" title="Left arrow key">
          ← {prevLabel}
        </Link>
      ) : (
        <span className="button secondary disabled">← Previous</span>
      )}
      <span className="muted pager-position">{position}</span>
      {nextHref ? (
        <Link href={nextHref} className="button secondary" title="Right arrow key">
          {nextLabel} →
        </Link>
      ) : (
        <span className="button secondary disabled">Next →</span>
      )}
    </div>
  );
}
