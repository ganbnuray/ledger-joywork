import { Pool } from "pg";
import { schema } from "./schema";
import type { Ledger } from "../ledger/types";
import { MATCHER_VERSION, matchAll, type Finding, type Status } from "../matcher/match";
import { screenMemos } from "../matcher/screen";

export type Review = {
  action: "confirm" | "correct";
  systemStatus: Status;
  reviewedStatus: Status;
  invoices: string[]; // where the person says the money belongs, empty if not given
  customerId: string | null; // the account the person says it belongs to
  note: string;
  createdAt: Date;
};

export type StoredFinding = Finding & {
  reviews: Review[]; // newest first
  reviewedStatus: Status | null; // what the latest review settled on
};

// One pool per server process. Next reloads modules in development, so keep it on globalThis.
const globalForPool = globalThis as unknown as { pool?: Pool };

function pool(): Pool {
  if (!globalForPool.pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    globalForPool.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return globalForPool.pool;
}

// Writes the matcher's findings. Reviews are kept, so a rerun never loses a person's decision.
export async function saveFindings(findings: Finding[]): Promise<void> {
  const db = pool();
  await db.query(schema);
  for (const f of findings) {
    await db.query(
      `insert into findings (payment_id, status, recorded_customer_id, likely_customer_id, likely_invoices,
         amount_cents, intended_applications, evidence, flags, decided_by, confidence, computed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       on conflict (payment_id) do update set
         status = excluded.status, recorded_customer_id = excluded.recorded_customer_id,
         likely_customer_id = excluded.likely_customer_id, likely_invoices = excluded.likely_invoices,
         amount_cents = excluded.amount_cents, intended_applications = excluded.intended_applications,
         evidence = excluded.evidence, flags = excluded.flags, decided_by = excluded.decided_by,
         confidence = excluded.confidence, computed_at = now()`,
      [
        f.paymentId,
        f.status,
        f.recordedCustomerId,
        f.likelyCustomerId,
        f.likelyInvoices,
        f.amount,
        JSON.stringify(f.intendedApplications),
        JSON.stringify(f.evidence),
        JSON.stringify(f.flags),
        f.decidedBy,
        f.confidence,
      ],
    );
  }
  await db.query(
    "insert into meta (key, value) values ('matcher_version', $1) on conflict (key) do update set value = excluded.value",
    [MATCHER_VERSION],
  );
}

// Creates the tables, and runs the matcher when the database is empty or was written by an older matcher.
let ready: Promise<void> | null = null;
export function ensureReady(ledger: Ledger): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = pool();
      await db.query(schema);
      const { rows } = await db.query("select count(*)::int as n from findings");
      const version = await db.query("select value from meta where key = 'matcher_version'");
      const stale = version.rows[0]?.value !== MATCHER_VERSION;
      if (rows[0].n < ledger.payments.length || stale) {
        await saveFindings((await screenMemos(ledger, matchAll(ledger))).findings);
      }
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

function fromRow(row: any, reviews: Review[]): StoredFinding {
  return {
    paymentId: row.payment_id,
    status: row.status,
    recordedCustomerId: row.recorded_customer_id,
    likelyCustomerId: row.likely_customer_id,
    likelyInvoices: row.likely_invoices,
    amount: Number(row.amount_cents),
    intendedApplications: row.intended_applications,
    evidence: row.evidence,
    flags: row.flags,
    decidedBy: row.decided_by,
    confidence: row.confidence,
    reviews,
    reviewedStatus: reviews[0]?.reviewedStatus ?? null,
  };
}

export async function listFindings(ledger: Ledger): Promise<StoredFinding[]> {
  await ensureReady(ledger);
  const db = pool();
  const [findings, reviews] = await Promise.all([
    db.query("select * from findings order by payment_id"),
    db.query("select * from reviews order by created_at desc, id desc"),
  ]);
  const byPayment = new Map<string, Review[]>();
  for (const r of reviews.rows) {
    const list = byPayment.get(r.payment_id) ?? [];
    list.push({
      action: r.action,
      systemStatus: r.system_status,
      reviewedStatus: r.reviewed_status,
      invoices: r.invoices ?? [],
      customerId: r.customer_id,
      note: r.note,
      createdAt: r.created_at,
    });
    byPayment.set(r.payment_id, list);
  }
  return findings.rows.map((row) => fromRow(row, byPayment.get(row.payment_id) ?? []));
}

export async function getFinding(ledger: Ledger, paymentId: string): Promise<StoredFinding | null> {
  const all = await listFindings(ledger);
  return all.find((f) => f.paymentId === paymentId) ?? null;
}

export async function addReview(
  paymentId: string,
  action: Review["action"],
  reviewedStatus: Status,
  note: string,
  invoices: string[] = [],
  customerId: string | null = null,
): Promise<void> {
  const db = pool();
  const { rows } = await db.query("select status from findings where payment_id = $1", [paymentId]);
  if (rows.length === 0) throw new Error(`No finding for ${paymentId}`);
  await db.query(
    `insert into reviews (payment_id, action, system_status, reviewed_status, note, invoices, customer_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [paymentId, action, rows[0].status, reviewedStatus, note, invoices, customerId],
  );
}
