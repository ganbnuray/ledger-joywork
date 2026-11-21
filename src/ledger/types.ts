// Types for the ledger after loading. All money is in integer cents.

export type Customer = {
  id: string;
  name: string;
  parent: string;
  billingEmail: string;
};

export type Invoice = {
  number: string;
  customerId: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  currency: string;
  description: string;
  status: "posted" | "void";
  voidNote?: string;
  // Billing month as "YYYY-MM", taken from the issue date.
  period: string;
};

export type Application = {
  invoice: string;
  amount: number;
};

export type Payment = {
  id: string;
  type: "payment" | "credit_memo";
  customerId: string | null;
  receivedDate: string;
  amount: number;
  currency: string;
  method: string;
  reference: string;
  memo: string;
  applications: Application[];
};

export type Ledger = {
  asOf: string;
  business: string;
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  customerById: Map<string, Customer>;
  invoiceByNumber: Map<string, Invoice>;
};
