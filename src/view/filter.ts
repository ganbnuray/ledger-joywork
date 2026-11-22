import type { Ledger } from "../ledger/types";
import type { Status } from "../matcher/match";
import type { StoredFinding } from "../db/findings";
import { needsReview } from "./labels";

export type FindingFilter = { status?: string; org?: string; review?: string; q?: string };

// True when a person reviewed the finding and the system still says what it said then.
// A review of an older answer stays in the history, but the finding needs a fresh look.
export function reviewIsCurrent(f: StoredFinding): boolean {
  const latest = f.reviews[0];
  return latest !== undefined && latest.systemStatus === f.status;
}

// The status a person settled on, or the system's status if nobody reviewed its current answer.
export function effectiveStatus(f: StoredFinding): Status {
  return reviewIsCurrent(f) ? f.reviews[0].reviewedStatus : f.status;
}

function matchesSearch(f: StoredFinding, q: string, ledger: Ledger): boolean {
  const p = ledger.payments.find((x) => x.id === f.paymentId)!;
  const haystack = [p.id, p.reference, p.memo, p.customerId ?? "", ...p.applications.map((a) => a.invoice), ...f.likelyInvoices]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export function filterFindings(all: StoredFinding[], filter: FindingFilter, ledger: Ledger): StoredFinding[] {
  return all.filter((f) => {
    const p = ledger.payments.find((x) => x.id === f.paymentId)!;
    const account = p.customerId ? ledger.customerById.get(p.customerId) : null;
    if (filter.status && effectiveStatus(f) !== filter.status) return false;
    if (filter.org === "none" && account) return false;
    if (filter.org && filter.org !== "none" && account?.parent !== filter.org) return false;
    if (filter.review === "unreviewed" && reviewIsCurrent(f)) return false;
    if (filter.review === "reviewed" && !reviewIsCurrent(f)) return false;
    if (filter.review === "queue" && !needsReview(f)) return false;
    if (filter.q && !matchesSearch(f, filter.q, ledger)) return false;
    return true;
  });
}

// The review queue: unsure findings, biggest amounts first.
export function reviewQueue(all: StoredFinding[]): StoredFinding[] {
  return all.filter(needsReview).sort((a, b) => b.amount - a.amount);
}

// Turns a filter back into "?status=...&q=...", or "" when nothing is filtered.
export function filterQuery(filter: FindingFilter): string {
  const params = new URLSearchParams();
  for (const key of ["status", "org", "review", "q"] as const) {
    if (filter[key]) params.set(key, filter[key]!);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
