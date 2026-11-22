import type { Customer, Invoice, Ledger, Payment } from "../ledger/types";
import { formatCents } from "../ledger/load";
import { computeBalances, recordedBalances, type InvoiceBalance } from "../ledger/balances";
import { parseMemo } from "../matcher/memo";
import { intendedApplicationsFor, type Finding } from "../matcher/match";
import { extractPaymentRefs, type EmailClaims } from "./extract";

export type Verdict =
  | "hold_reminder" // books say open, but money was meant for it
  | "paid" // books and the corrected view both say paid
  | "owed" // really still owed
  | "void" // nothing is owed on a void invoice
  | "needs_human"; // an open finding on it needs a person first

export type InvoiceCheck = {
  invoice: string;
  description: string;
  amount: number;
  recordedBalance: number;
  correctedBalance: number;
  verdict: Verdict;
  reason: string;
  paymentIds: string[];
};

export type PaymentMatch = {
  paymentId: string;
  status: Finding["status"];
  why: string[];
};

export type EmailCheck = {
  claims: EmailClaims;
  account: Customer | null;
  accountEvidence: string[];
  warnings: string[];
  payments: PaymentMatch[];
  invoices: InvoiceCheck[]; // invoices the email is about
  otherOwed: InvoiceCheck[]; // owed on the account, but the email does not mention them
  outcome: "customer_right" | "partly_right" | "not_supported" | "needs_human" | "nothing_to_check";
  summary: string[];
};

function sameName(a: string, b: string): boolean {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return clean(a) === clean(b);
}

// Finds the account from the sender address, the "Account:" line and the invoices named.
// These are all customer text, so a disagreement is shown, never settled silently.
export function resolveAccount(claims: EmailClaims, ledger: Ledger) {
  const evidence: string[] = [];
  const warnings: string[] = [];

  const byEmail = ledger.customers.find((c) => c.billingEmail.toLowerCase() === claims.senderEmail);
  const byName = claims.accountName ? ledger.customers.find((c) => sameName(c.name, claims.accountName!)) : undefined;
  const byInvoice = [...new Set(claims.invoiceRefs.map((n) => ledger.invoiceByNumber.get(n)!.customerId))];

  if (byEmail) evidence.push(`Sender ${claims.senderEmail} is the billing email of ${byEmail.name} (${byEmail.id}).`);
  else if (claims.senderEmail) warnings.push(`Sender ${claims.senderEmail} is not a billing email on any account.`);
  if (byName) evidence.push(`Email names the account ${byName.name} (${byName.id}).`);
  else if (claims.accountName) warnings.push(`No account is named "${claims.accountName}".`);

  if (byEmail && byName && byEmail.id !== byName.id) {
    warnings.push(`Sender belongs to ${byEmail.name}, but the email names ${byName.name}. Using the sender's account.`);
  }

  const account = byEmail ?? byName ?? (byInvoice.length === 1 ? ledger.customerById.get(byInvoice[0])! : null);
  if (account && !byEmail && !byName) evidence.push(`Account taken from the invoices named: ${account.name} (${account.id}).`);

  const elsewhere = byInvoice.filter((id) => id !== account?.id);
  if (account && elsewhere.length > 0) {
    const names = elsewhere.map((id) => ledger.customerById.get(id)!.name).join(", ");
    warnings.push(`Some invoices named belong to a different account: ${names}.`);
  }
  if (!account) warnings.push("Could not tell which account this email is from.");

  return { account: account ?? null, evidence, warnings };
}

function withinDays(a: string, b: string, days: number): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) <= days * 86_400_000;
}

// The invoices the email is about: those named, those in the months named,
// and everything up to the month in "paid through October".
export function claimedInvoices(claims: EmailClaims, account: Customer | null, ledger: Ledger): Invoice[] {
  const numbers = new Set(claims.invoiceRefs);
  if (account) {
    for (const inv of ledger.invoices) {
      if (inv.customerId !== account.id || inv.status !== "posted") continue;
      if (claims.periods.includes(inv.period)) numbers.add(inv.number);
      if (claims.paidThrough && inv.period <= claims.paidThrough) numbers.add(inv.number);
    }
  }
  return ledger.invoices
    .filter((inv) => numbers.has(inv.number))
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
}

// Payments the email most likely refers to, with the reason for each match.
// A reference match is searched across every account, since money often lands on a sister account.
// Weaker matches are only taken from the same organization.
export function findPayments(
  claims: EmailClaims,
  account: Customer | null,
  invoices: Invoice[],
  ledger: Ledger,
  findings: Map<string, Finding>,
): PaymentMatch[] {
  const invoiceNumbers = new Set(invoices.map((i) => i.number));
  const org = account ? ledger.customers.filter((c) => c.parent === account.parent).map((c) => c.id) : [];
  const matches: PaymentMatch[] = [];

  for (const p of ledger.payments) {
    const why: string[] = [];
    const finding = findings.get(p.id)!;
    const inOrg = p.customerId === null || org.includes(p.customerId);

    const ref = extractPaymentRefs(p.reference).find((r) => claims.paymentRefs.includes(r));
    if (ref) why.push(`Reference ${ref} matches.`);

    if (inOrg) {
      const touched = [
        ...p.applications.map((a) => a.invoice),
        ...(finding.intendedApplications ?? []).map((a) => a.invoice),
        ...parseMemo(p.memo, ledger).invoiceRefs,
      ].filter((n) => invoiceNumbers.has(n));
      if (touched.length > 0) why.push(`Recorded, meant or named for ${[...new Set(touched)].join(", ")}.`);

      const date = claims.dates.find((d) => withinDays(d, p.receivedDate, 3));
      if (date && (claims.amounts.length === 0 || claims.amounts.includes(p.amount))) {
        why.push(`Received ${p.receivedDate}, close to the date in the email (${date}).`);
      }
      if (claims.amounts.includes(p.amount)) why.push(`Amount ${formatCents(p.amount)} matches the email.`);
      if (claims.mentionsCredit && p.type === "credit_memo" && account && p.customerId === account.id) {
        why.push("Email mentions a credit, and this is a credit memo on the account.");
      }
    }

    // An amount alone is too weak: many invoices share the same amount.
    const onlyAmount = why.length === 1 && why[0].startsWith("Amount");
    if (why.length > 0 && !onlyAmount) matches.push({ paymentId: p.id, status: finding.status, why });
  }
  return matches;
}

function paymentsTouching(invoice: string, ledger: Ledger, intended: (id: string) => { invoice: string }[]) {
  return ledger.payments
    .filter((p) => p.applications.some((a) => a.invoice === invoice) || intended(p.id).some((a) => a.invoice === invoice))
    .map((p) => p.id);
}

// Compares what the books say today with the picture after the fixes the matcher found.
export function checkInvoice(
  inv: Invoice,
  recorded: Map<string, InvoiceBalance>,
  corrected: Map<string, InvoiceBalance>,
  ledger: Ledger,
  findings: Map<string, Finding>,
  intended: (id: string) => { invoice: string; amount: number }[],
): InvoiceCheck {
  const r = recorded.get(inv.number)!.balance;
  const c = corrected.get(inv.number)!.balance;
  const paymentIds = paymentsTouching(inv.number, ledger, intended);
  const base = { invoice: inv.number, description: inv.description, amount: inv.amount, recordedBalance: r, correctedBalance: c, paymentIds };

  if (inv.status === "void") {
    return { ...base, verdict: "void", reason: `Void. Nothing is owed on it. ${inv.voidNote ?? ""}`.trim() };
  }

  // Money meant for this invoice that the books do not show yet.
  const fixes = ledger.payments
    .filter((p) => {
      const f = findings.get(p.id)!;
      const meant = intended(p.id).some((a) => a.invoice === inv.number);
      const recordedHere = p.applications.some((a) => a.invoice === inv.number);
      return f.status !== "ok" && f.status !== "needs_human" && meant && !recordedHere;
    })
    .map((p) => `${p.id} (${findings.get(p.id)!.status})`);

  // Money recorded here that belongs somewhere else.
  const moved = ledger.payments
    .filter((p) => p.applications.some((a) => a.invoice === inv.number) && !intended(p.id).some((a) => a.invoice === inv.number))
    .map((p) => `${p.id} (${findings.get(p.id)!.status})`);

  const pending = ledger.payments
    .filter((p) => {
      const f = findings.get(p.id)!;
      return f.status === "needs_human" && (f.likelyInvoices.includes(inv.number) || p.applications.some((a) => a.invoice === inv.number));
    })
    .map((p) => p.id);

  if (c > 0 && pending.length > 0) {
    return {
      ...base,
      verdict: "needs_human",
      reason: `${formatCents(c)} still open, and ${pending.join(", ")} on it needs a person to decide first. Hold any reminder until then.`,
    };
  }
  if (c <= 0 && r > 0) {
    return {
      ...base,
      verdict: "hold_reminder",
      reason: `Books show ${formatCents(r)} open, but ${fixes.join(", ")} was meant for it. Fix the books, do not send a reminder.`,
    };
  }
  if (c <= 0) return { ...base, verdict: "paid", reason: "Paid, on the books and after corrections." };
  if (r <= 0) {
    return {
      ...base,
      verdict: "owed",
      reason: `Books show it paid, but ${moved.join(", ")} was meant for a different invoice. ${formatCents(c)} is really still owed.`,
    };
  }
  const partial = c < inv.amount ? ` (${formatCents(inv.amount - c)} of ${formatCents(inv.amount)} paid)` : "";
  const due = inv.dueDate > ledger.asOf ? ` Not due until ${inv.dueDate}.` : ` Due ${inv.dueDate}.`;
  return { ...base, verdict: "owed", reason: `${formatCents(c)} still owed${partial}. No payment found that was meant for it.${due}` };
}

function outcomeFor(invoices: InvoiceCheck[]): EmailCheck["outcome"] {
  const relevant = invoices.filter((i) => i.verdict !== "void");
  if (relevant.length === 0) return invoices.length > 0 ? "customer_right" : "nothing_to_check";
  if (relevant.some((i) => i.verdict === "needs_human")) return "needs_human";
  const owed = relevant.filter((i) => i.verdict === "owed").length;
  if (owed === 0) return "customer_right";
  return owed === relevant.length ? "not_supported" : "partly_right";
}

export function checkEmail(claims: EmailClaims, ledger: Ledger, findingList: Finding[]): EmailCheck {
  const findings = new Map(findingList.map((f) => [f.paymentId, f]));
  const intended = intendedApplicationsFor(ledger, findingList);
  const recorded = recordedBalances(ledger);
  const corrected = computeBalances(ledger, intended);

  const { account, evidence, warnings } = resolveAccount(claims, ledger);
  if (claims.suspicious) warnings.push("The email contains text aimed at an automated system. It changes nothing here: the answer comes from the ledger.");
  if (claims.unknownRefs.length > 0) warnings.push(`Email names invoices that do not exist: ${claims.unknownRefs.join(", ")}.`);

  const claimed = claimedInvoices(claims, account, ledger);
  const payments = findPayments(claims, account, claimed, ledger, findings);
  const check = (inv: Invoice) => checkInvoice(inv, recorded, corrected, ledger, findings, intended);
  const invoices = claimed.map(check);

  const mentioned = new Set(claimed.map((i) => i.number));
  const otherOwed = account
    ? ledger.invoices
        .filter((inv) => inv.customerId === account.id && inv.status === "posted" && !mentioned.has(inv.number))
        .map(check)
        .filter((i) => i.verdict === "owed" || i.verdict === "needs_human" || i.verdict === "hold_reminder")
    : [];

  for (const ref of claims.paymentRefs) {
    if (!payments.some((m) => m.why.some((w) => w.includes(ref)))) warnings.push(`No payment in the ledger has the reference ${ref}.`);
  }

  const summary: string[] = [];
  const hold = invoices.filter((i) => i.verdict === "hold_reminder" || i.verdict === "needs_human").map((i) => i.invoice);
  const owed = invoices.filter((i) => i.verdict === "owed").map((i) => i.invoice);
  const paid = invoices.filter((i) => i.verdict === "paid").map((i) => i.invoice);
  if (hold.length) summary.push(`Hold reminders for ${hold.join(", ")} and fix the books first.`);
  if (paid.length) summary.push(`Already paid on the books: ${paid.join(", ")}.`);
  if (owed.length) summary.push(`Still owed despite the email: ${owed.join(", ")}.`);
  if (claimed.length === 0) summary.push("The email names no invoice or month that could be checked. Ask the customer for an invoice number or payment reference.");
  if (owed.length && payments.length === 0) summary.push("No payment matches the email. Ask the customer for remittance details before sending another reminder.");
  if (otherOwed.length) summary.push(`Also open on the account: ${otherOwed.map((i) => i.invoice).join(", ")}.`);

  return {
    claims,
    account,
    accountEvidence: evidence,
    warnings,
    payments,
    invoices,
    otherOwed,
    outcome: outcomeFor(invoices),
    summary,
  };
}
