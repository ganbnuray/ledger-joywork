import type { Application, Ledger } from "./types";

export type InvoiceBalance = {
  invoice: string;
  amount: number;
  applied: number;
  balance: number;
  state: "open" | "partial" | "paid" | "overpaid" | "void";
};

// Balance of every invoice, given which applications to count for each payment.
// Pass the recorded applications to get what the books say today,
// or the intended applications to get the corrected picture.
export function computeBalances(
  ledger: Ledger,
  applicationsFor: (paymentId: string) => Application[],
): Map<string, InvoiceBalance> {
  const applied = new Map<string, number>();
  for (const p of ledger.payments) {
    for (const a of applicationsFor(p.id)) {
      applied.set(a.invoice, (applied.get(a.invoice) ?? 0) + a.amount);
    }
  }

  const result = new Map<string, InvoiceBalance>();
  for (const inv of ledger.invoices) {
    const total = applied.get(inv.number) ?? 0;
    const balance = inv.amount - total;
    let state: InvoiceBalance["state"];
    if (inv.status === "void") state = "void";
    else if (balance === inv.amount) state = "open";
    else if (balance > 0) state = "partial";
    else if (balance === 0) state = "paid";
    else state = "overpaid";
    result.set(inv.number, { invoice: inv.number, amount: inv.amount, applied: total, balance, state });
  }
  return result;
}

export function recordedBalances(ledger: Ledger): Map<string, InvoiceBalance> {
  const byId = new Map(ledger.payments.map((p) => [p.id, p.applications]));
  return computeBalances(ledger, (id) => byId.get(id) ?? []);
}

// Posted invoices on an account that still have money owed.
export function openInvoices(ledger: Ledger, customerId: string, balances: Map<string, InvoiceBalance>) {
  return ledger.invoices.filter(
    (inv) =>
      inv.customerId === customerId &&
      inv.status === "posted" &&
      (balances.get(inv.number)?.balance ?? inv.amount) > 0,
  );
}
