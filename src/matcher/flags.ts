import type { Ledger, Payment } from "../ledger/types";

// Facts about a payment that plain code can check from the numbers alone.
export type Flag =
  | { kind: "over_applied"; applied: number; received: number }
  | { kind: "void_target"; invoice: string; replacedBy: string | null }
  | { kind: "future_invoice"; invoice: string; issueDate: string }
  | { kind: "cross_account_application"; invoice: string; invoiceCustomerId: string }
  | { kind: "possible_duplicate"; of: string }
  | { kind: "no_account" }
  | { kind: "suspicious_memo" };

export function appliedTotal(p: Payment): number {
  return p.applications.reduce((sum, a) => sum + a.amount, 0);
}

// Reads "Replaced by NB-3520" out of a void note.
export function replacementFor(voidNote: string | undefined): string | null {
  const match = voidNote?.match(/replaced by (NB-\d{4})/i);
  return match ? match[1].toUpperCase() : null;
}

export function numericFlags(p: Payment, ledger: Ledger): Flag[] {
  const flags: Flag[] = [];
  const applied = appliedTotal(p);

  if (p.customerId === null) flags.push({ kind: "no_account" });
  if (applied > p.amount) flags.push({ kind: "over_applied", applied, received: p.amount });

  for (const a of p.applications) {
    const inv = ledger.invoiceByNumber.get(a.invoice);
    if (!inv) continue;
    if (inv.status === "void") {
      flags.push({ kind: "void_target", invoice: inv.number, replacedBy: replacementFor(inv.voidNote) });
    }
    if (inv.issueDate > p.receivedDate) {
      flags.push({ kind: "future_invoice", invoice: inv.number, issueDate: inv.issueDate });
    }
    if (p.customerId !== null && inv.customerId !== p.customerId) {
      flags.push({ kind: "cross_account_application", invoice: inv.number, invoiceCustomerId: inv.customerId });
    }
  }
  return flags;
}

// A later payment on the same account, for the same amount and the same invoices
// in the memo, within a week of an earlier one.
export function findDuplicateOf(
  p: Payment,
  refs: string[],
  all: Payment[],
  refsFor: (other: Payment) => string[],
): string | null {
  if (refs.length === 0) return null;
  const key = [...refs].sort().join(",");
  for (const other of all) {
    if (other.id === p.id || other.customerId !== p.customerId || other.amount !== p.amount) continue;
    if (other.receivedDate > p.receivedDate) continue;
    if (other.receivedDate === p.receivedDate && other.id > p.id) continue;
    const days = (Date.parse(p.receivedDate) - Date.parse(other.receivedDate)) / 86_400_000;
    if (days > 7) continue;
    if ([...refsFor(other)].sort().join(",") === key) return other.id;
  }
  return null;
}
