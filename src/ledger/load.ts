import { readFileSync } from "node:fs";
import type { Ledger, Invoice, Payment, Customer } from "./types";

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

// Turns the raw JSON into typed records with money in cents.
// The raw file is never changed.
export function parseLedger(raw: any): Ledger {
  const customers: Customer[] = raw.customers.map((c: any) => ({
    id: c.id,
    name: c.name,
    parent: c.parent,
    billingEmail: c.billing_email,
  }));

  const invoices: Invoice[] = raw.invoices.map((i: any) => ({
    number: i.number,
    customerId: i.customer_id,
    issueDate: i.issue_date,
    dueDate: i.due_date,
    amount: toCents(i.amount),
    currency: i.currency,
    description: i.description,
    status: i.status,
    voidNote: i.void_note,
    period: i.issue_date.slice(0, 7),
  }));

  const payments: Payment[] = raw.payments.map((p: any) => ({
    id: p.id,
    type: p.type,
    customerId: p.customer_id,
    receivedDate: p.received_date,
    amount: toCents(p.amount),
    currency: p.currency,
    method: p.method,
    reference: p.reference,
    memo: p.memo ?? "",
    applications: p.applications.map((a: any) => ({ invoice: a.invoice, amount: toCents(a.amount) })),
  }));

  return {
    asOf: raw.as_of,
    business: raw.business,
    customers,
    invoices,
    payments,
    customerById: new Map(customers.map((c) => [c.id, c])),
    invoiceByNumber: new Map(invoices.map((i) => [i.number, i])),
  };
}

export function loadLedger(path = "data/ledger.json"): Ledger {
  return parseLedger(JSON.parse(readFileSync(path, "utf8")));
}
