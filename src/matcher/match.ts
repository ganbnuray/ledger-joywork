import type { Application, Invoice, Ledger, Payment } from "../ledger/types";
import { formatCents } from "../ledger/load";
import { openInvoices, recordedBalances, type InvoiceBalance } from "../ledger/balances";
import { parseMemo, type MemoSignals } from "./memo";
import { appliedTotal, findDuplicateOf, numericFlags, replacementFor, type Flag } from "./flags";

export type Status = "ok" | "misapplied" | "wrong_account" | "unapplied" | "needs_human";

export type Finding = {
  paymentId: string;
  status: Status;
  recordedCustomerId: string | null;
  likelyCustomerId: string | null;
  likelyInvoices: string[];
  amount: number; // cents involved in the problem (0 for ok)
  intendedApplications: Application[] | null; // where the money should sit, if we can say
  evidence: string[];
  flags: Flag[];
  decidedBy: "rule";
  confidence: "high" | "low";
};

type Intent = {
  accountId: string | null;
  invoices: Invoice[];
  source: "invoice" | "month" | "none";
  conflict: string | null;
};

const NO_SIGNALS: MemoSignals = {
  invoiceRefs: [],
  unknownRefs: [],
  periods: [],
  locationAccountIds: [],
  mentionsDiscount: false,
  suspicious: false,
};

// Spreads an amount over invoices in order, filling each one up to its amount.
export function allocate(amount: number, invoices: Invoice[]): Application[] {
  const result: Application[] = [];
  let left = amount;
  for (const inv of invoices) {
    if (left <= 0) break;
    const part = Math.min(left, inv.amount);
    result.push({ invoice: inv.number, amount: part });
    left -= part;
  }
  return result;
}

// Works out which account and invoices the customer meant, from the memo.
export function resolveIntent(p: Payment, signals: MemoSignals, ledger: Ledger): Intent {
  const referenced = signals.invoiceRefs.map((n) => ledger.invoiceByNumber.get(n)!);

  // A void invoice in the memo means the customer meant its replacement.
  const invoices = referenced.map((inv) => {
    const replacement = inv.status === "void" ? replacementFor(inv.voidNote) : null;
    return replacement ? ledger.invoiceByNumber.get(replacement) ?? inv : inv;
  });

  const candidates = [
    ...new Set([...invoices.map((i) => i.customerId), ...signals.locationAccountIds]),
  ];
  if (candidates.length > 1) {
    return { accountId: null, invoices: [], source: "none", conflict: `memo points to several accounts: ${candidates.join(", ")}` };
  }
  const accountId = candidates[0] ?? p.customerId;

  if (referenced.length > 0) {
    if (signals.periods.length > 0) {
      const outside = referenced.filter((inv) => !signals.periods.includes(inv.period));
      if (outside.length > 0) {
        return {
          accountId,
          invoices: [],
          source: "none",
          conflict: `memo names ${outside.map((i) => i.number).join(", ")} but a different month`,
        };
      }
    }
    return { accountId, invoices, source: "invoice", conflict: null };
  }

  if (signals.periods.length > 0 && accountId) {
    const byMonth = ledger.invoices.filter(
      (inv) => inv.customerId === accountId && inv.status === "posted" && signals.periods.includes(inv.period),
    );
    if (byMonth.length > 0) return { accountId, invoices: byMonth, source: "month", conflict: null };
  }

  return { accountId, invoices: [], source: "none", conflict: null };
}

function describeInvoices(invoices: Invoice[]): string {
  return invoices.map((i) => `${i.number} (${i.description})`).join(", ");
}

export function matchPayment(p: Payment, ledger: Ledger, balances: Map<string, InvoiceBalance> = recordedBalances(ledger)): Finding {
  const parsed = parseMemo(p.memo, ledger);
  const signals = parsed.suspicious ? NO_SIGNALS : parsed;
  const flags = numericFlags(p, ledger);
  const evidence: string[] = [];
  const applied = appliedTotal(p);
  const remainder = p.amount - applied;

  const base = {
    paymentId: p.id,
    recordedCustomerId: p.customerId,
    flags,
    decidedBy: "rule" as const,
  };

  if (parsed.suspicious) {
    flags.push({ kind: "suspicious_memo" });
    evidence.push("Memo contains text aimed at an automated system. It was ignored as evidence.");
  }
  if (p.memo.trim() === "") evidence.push("No memo.");
  if (parsed.unknownRefs.length > 0) evidence.push(`Memo names invoices that do not exist: ${parsed.unknownRefs.join(", ")}.`);

  // 1. Nobody knows whose money this is.
  if (p.customerId === null) {
    const lower = p.memo.toLowerCase();
    const parent = ledger.customers.find((c) => lower.includes(c.parent.split(" ")[0].toLowerCase()))?.parent;
    let suggestion: Application[] | null = null;
    let likelyInvoices: string[] = [];
    evidence.push("Payment was recorded with no account.");
    if (parent) {
      const accounts = ledger.customers.filter((c) => c.parent === parent).map((c) => c.id);
      const candidates = accounts
        .flatMap((id) => openInvoices(ledger, id, balances))
        .filter((inv) => signals.periods.includes(inv.period));
      const total = candidates.reduce((sum, inv) => sum + inv.amount, 0);
      evidence.push(`Memo names the ${parent} organization.`);
      if (candidates.length > 0 && total === p.amount) {
        suggestion = allocate(p.amount, candidates);
        likelyInvoices = candidates.map((i) => i.number);
        evidence.push(`Amount matches the open invoices ${describeInvoices(candidates)} exactly (${formatCents(total)}).`);
      }
    }
    evidence.push("A person must confirm who paid before the money is applied.");
    return {
      ...base,
      status: "needs_human",
      likelyCustomerId: null,
      likelyInvoices,
      amount: p.amount,
      intendedApplications: suggestion,
      evidence,
      confidence: "low",
    };
  }

  // 2. Same money twice.
  const duplicateOf = findDuplicateOf(p, signals.invoiceRefs, ledger.payments, (o) =>
    parseMemo(o.memo, ledger).invoiceRefs,
  );
  if (duplicateOf) {
    flags.push({ kind: "possible_duplicate", of: duplicateOf });
    const open = openInvoices(ledger, p.customerId, balances);
    evidence.push(`Same amount and same invoice in the memo as ${duplicateOf}, received within a week.`);
    evidence.push(`A person must decide: refund, or apply to another open invoice (${open.map((i) => i.number).join(", ") || "none"}).`);
    return {
      ...base,
      status: "needs_human",
      likelyCustomerId: p.customerId,
      likelyInvoices: signals.invoiceRefs,
      amount: remainder,
      intendedApplications: null,
      evidence,
      confidence: "low",
    };
  }

  const intent = resolveIntent(p, signals, ledger);

  // 3. The memo contradicts itself.
  if (intent.conflict) {
    evidence.push(`Memo is inconsistent: ${intent.conflict}.`);
    return {
      ...base,
      status: "needs_human",
      likelyCustomerId: intent.accountId,
      likelyInvoices: [],
      amount: p.amount,
      intendedApplications: null,
      evidence,
      confidence: "low",
    };
  }

  const intendedTotal = intent.invoices.reduce((sum, inv) => sum + inv.amount, 0);
  if (intent.source === "invoice") {
    evidence.push(`Memo names ${signals.invoiceRefs.join(", ")}.`);
    const replaced = intent.invoices.filter((inv) => !signals.invoiceRefs.includes(inv.number));
    if (replaced.length > 0) evidence.push(`A named invoice is void. The customer meant its replacement: ${describeInvoices(replaced)}.`);
    else evidence.push(`Customer meant ${describeInvoices(intent.invoices)}.`);
  }
  if (intent.source === "month") evidence.push(`Memo names a month, matching ${describeInvoices(intent.invoices)}.`);
  if (intent.source !== "none") {
    evidence.push(
      intendedTotal === p.amount
        ? `Amount ${formatCents(p.amount)} matches those invoices.`
        : `Amount ${formatCents(p.amount)} differs from those invoices (${formatCents(intendedTotal)}).`,
    );
  }
  const amountMatches = intent.source !== "none" && intendedTotal === p.amount;

  // 4. Customer paid less and claims a discount. Only Brightline can accept that.
  if (signals.mentionsDiscount && p.amount < intendedTotal) {
    evidence.push(`Memo claims a discount or deduction. Nothing in the ledger shows one was agreed. Short by ${formatCents(intendedTotal - p.amount)}.`);
    return {
      ...base,
      status: "needs_human",
      likelyCustomerId: intent.accountId,
      likelyInvoices: intent.invoices.map((i) => i.number),
      amount: intendedTotal - p.amount,
      intendedApplications: null,
      evidence,
      confidence: "low",
    };
  }

  const recordedLine = p.applications.length
    ? `Recorded against ${p.applications.map((a) => `${a.invoice} (${formatCents(a.amount)})`).join(", ")}.`
    : "Recorded against no invoice.";
  evidence.push(recordedLine);
  for (const f of flags) {
    if (f.kind === "over_applied") evidence.push(`Applied ${formatCents(f.applied)} but only ${formatCents(f.received)} was received.`);
    if (f.kind === "void_target") evidence.push(`Applied to ${f.invoice}, which is void${f.replacedBy ? ` and was replaced by ${f.replacedBy}` : ""}.`);
    if (f.kind === "future_invoice") evidence.push(`Applied to ${f.invoice}, issued ${f.issueDate}, after the payment arrived on ${p.receivedDate}.`);
  }

  // 5. Meant for a different account.
  if (intent.accountId !== p.customerId) {
    const account = ledger.customerById.get(intent.accountId!)!;
    evidence.push(`Memo points to ${account.name} (${account.id}), but the payment was recorded on ${p.customerId}.`);
    return {
      ...base,
      status: "wrong_account",
      likelyCustomerId: intent.accountId,
      likelyInvoices: intent.invoices.map((i) => i.number),
      amount: p.amount,
      intendedApplications: allocate(p.amount, intent.invoices),
      evidence,
      confidence: amountMatches ? "high" : "low",
    };
  }

  // 6. We know what the customer meant on this account.
  if (intent.invoices.length > 0) {
    const intended = new Set(intent.invoices.map((i) => i.number));
    const wrong = p.applications.filter((a) => !intended.has(a.invoice));
    const intendedApplications = allocate(p.amount, intent.invoices);

    if (wrong.length > 0) {
      return {
        ...base,
        status: "misapplied",
        likelyCustomerId: p.customerId,
        likelyInvoices: [...intended],
        amount: wrong.reduce((sum, a) => sum + a.amount, 0),
        intendedApplications,
        evidence,
        confidence: amountMatches ? "high" : "low",
      };
    }
    if (remainder > 0) {
      const missing = intent.invoices.filter((inv) => !p.applications.some((a) => a.invoice === inv.number));
      evidence.push(`${formatCents(remainder)} is not applied to any invoice.`);
      return {
        ...base,
        status: "unapplied",
        likelyCustomerId: p.customerId,
        likelyInvoices: missing.map((i) => i.number),
        amount: remainder,
        intendedApplications,
        evidence,
        confidence: amountMatches ? "high" : "low",
      };
    }
    return {
      ...base,
      status: "ok",
      likelyCustomerId: p.customerId,
      likelyInvoices: [...intended],
      amount: 0,
      intendedApplications: null,
      evidence,
      confidence: amountMatches ? "high" : "low",
    };
  }

  // 7. No usable memo. Judge from the numbers alone.
  const badTarget = flags.find((f) => f.kind === "void_target" || f.kind === "future_invoice" || f.kind === "over_applied");
  if (badTarget) {
    const replacement = flags.find((f) => f.kind === "void_target")?.replacedBy;
    return {
      ...base,
      status: "misapplied",
      likelyCustomerId: p.customerId,
      likelyInvoices: replacement ? [replacement] : [],
      amount: p.amount,
      intendedApplications: null,
      evidence,
      confidence: "low",
    };
  }

  const open = openInvoices(ledger, p.customerId, balances);
  if (remainder > 0 && open.length > 0) {
    const oldest = [...open].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    evidence.push(`${formatCents(remainder)} is not applied while the account has ${open.length} open invoices. Oldest open: ${oldest[0].number}.`);
    return {
      ...base,
      status: "unapplied",
      likelyCustomerId: p.customerId,
      likelyInvoices: [oldest[0].number],
      amount: remainder,
      intendedApplications: [...p.applications, ...allocate(remainder, oldest)],
      evidence,
      confidence: "low",
    };
  }

  evidence.push("Nothing suggests the payment was meant for a different invoice.");
  return {
    ...base,
    status: "ok",
    likelyCustomerId: p.customerId,
    likelyInvoices: p.applications.map((a) => a.invoice),
    amount: 0,
    intendedApplications: null,
    evidence,
    confidence: "high",
  };
}

export function matchAll(ledger: Ledger): Finding[] {
  const balances = recordedBalances(ledger);
  return ledger.payments.map((p) => matchPayment(p, ledger, balances));
}

// Where each payment's money should sit after the fixes we are sure about.
// Findings that need a person keep their recorded applications.
export function intendedApplicationsFor(ledger: Ledger, findings: Finding[]) {
  const byId = new Map(findings.map((f) => [f.paymentId, f]));
  const payments = new Map(ledger.payments.map((p) => [p.id, p]));
  return (paymentId: string): Application[] => {
    const f = byId.get(paymentId);
    if (f && f.status !== "needs_human" && f.status !== "ok" && f.intendedApplications) return f.intendedApplications;
    return payments.get(paymentId)?.applications ?? [];
  };
}
