import { Pool } from "pg";
import { schema } from "./schema";
import type { Ledger } from "../ledger/types";
import { matchAll, type Finding, type Status } from "../matcher/match";
import { screenMemos } from "../matcher/screen";
import { MATCHER_VERSION } from "../matcher/versions";

export type Review = {
  action: "confirm" | "correct";
  systemStatus: Status;
  reviewedStatus: Status;
  invoices: string[]; // where the person says the money belongs, empty if not given
  customerId: string | null; // the account the person says it belongs to
  note: string;
  createdAt: Date;
  matcherVersion: string | null; // the system version shown when the person reviewed, null if before versions
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
  await saveVersion(MATCHER_VERSION, findings, true);
  await db.query(
    "insert into meta (key, value) values ('matcher_version', $1) on conflict (key) do update set value = excluded.value",
    [MATCHER_VERSION],
  );
}

// Stores one version's findings. Old versions are never overwritten (replace = false).
async function saveVersion(version: string, findings: Finding[], replace: boolean): Promise<void> {
  const db = pool();
  for (const f of findings) {
    await db.query(
      `insert into finding_versions (version, payment_id, status, likely_customer_id, likely_invoices, amount_cents,
         evidence, flags, decided_by, confidence, intended_applications)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (version, payment_id) do ${
         replace
           ? `update set status = excluded.status, likely_customer_id = excluded.likely_customer_id,
              likely_invoices = excluded.likely_invoices, amount_cents = excluded.amount_cents,
              evidence = excluded.evidence, flags = excluded.flags, decided_by = excluded.decided_by,
              confidence = excluded.confidence, intended_applications = excluded.intended_applications,
              computed_at = now()`
           : "nothing"
       }`,
      [
        version,
        f.paymentId,
        f.status,
        f.likelyCustomerId,
        f.likelyInvoices,
        f.amount,
        JSON.stringify(f.evidence),
        JSON.stringify(f.flags),
        f.decidedBy,
        f.confidence,
        JSON.stringify(f.intendedApplications),
      ],
    );
  }
}

// Fills in where the money belongs for versions stored before that column existed.
// Version 1 is rebuilt from its rules. The current version is copied from the live findings.
async function backfillIntended(ledger: Ledger): Promise<void> {
  const db = pool();
  for (const f of matchAll(ledger, { holdInjections: false })) {
    await db.query(
      `update finding_versions set intended_applications = $1
       where version = '1' and payment_id = $2 and intended_applications is null`,
      [JSON.stringify(f.intendedApplications), f.paymentId],
    );
  }
  await db.query(
    `update finding_versions fv set intended_applications = f.intended_applications
     from findings f where fv.version = $1 and fv.payment_id = f.payment_id and fv.intended_applications is null`,
    [MATCHER_VERSION],
  );
}

// Creates the tables, and runs the matcher when the database is empty or was written by an older version.
// Before new findings replace old ones, the old ones are copied into finding_versions, so nothing is lost.
let ready: Promise<void> | null = null;
export function ensureReady(ledger: Ledger): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = pool();
      await db.query(schema);
      const { rows } = await db.query("select * from findings");
      const stored = (await db.query("select value from meta where key = 'matcher_version'")).rows[0]?.value ?? null;

      // Keep what an older version wrote. Databases from before versions existed hold version 1.
      if (rows.length > 0 && stored !== MATCHER_VERSION) {
        await saveVersion(stored ?? "1", rows.map((row) => fromRow(row, [])), false);
      }
      // Version 1 used rules only, so it can be rebuilt exactly if it was overwritten before it was kept.
      await saveVersion("1", matchAll(ledger, { holdInjections: false }), false);

      if (rows.length < ledger.payments.length || stored !== MATCHER_VERSION) {
        await saveFindings((await screenMemos(ledger, matchAll(ledger))).findings);
      } else {
        await saveVersion(MATCHER_VERSION, rows.map((row) => fromRow(row, [])), false);
      }
      await backfillIntended(ledger);
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

async function reviewsByPayment(): Promise<Map<string, Review[]>> {
  const { rows } = await pool().query("select * from reviews order by created_at desc, id desc");
  const byPayment = new Map<string, Review[]>();
  for (const r of rows) {
    const list = byPayment.get(r.payment_id) ?? [];
    list.push({
      action: r.action,
      systemStatus: r.system_status,
      reviewedStatus: r.reviewed_status,
      invoices: r.invoices ?? [],
      customerId: r.customer_id,
      note: r.note,
      createdAt: r.created_at,
      matcherVersion: r.matcher_version,
    });
    byPayment.set(r.payment_id, list);
  }
  return byPayment;
}

// The findings as one system version gave them, with every manual review attached.
// Without a version, or with one that is not stored, this is the current version.
export async function listFindings(ledger: Ledger, version: string = MATCHER_VERSION): Promise<StoredFinding[]> {
  await ensureReady(ledger);
  const db = pool();
  const reviews = await reviewsByPayment();
  const attach = (row: any) => fromRow(row, reviews.get(row.payment_id) ?? []);

  if (version !== MATCHER_VERSION) {
    const { rows } = await db.query("select * from finding_versions where version = $1 order by payment_id", [version]);
    if (rows.length > 0) {
      const recordedOn = new Map(ledger.payments.map((p) => [p.id, p.customerId]));
      return rows.map((row) => attach({ ...row, recorded_customer_id: recordedOn.get(row.payment_id) ?? null }));
    }
  }
  const { rows } = await db.query("select * from findings order by payment_id");
  return rows.map(attach);
}

export async function listVersionNames(ledger: Ledger): Promise<string[]> {
  await ensureReady(ledger);
  const { rows } = await pool().query("select distinct version from finding_versions");
  return rows.map((r) => r.version as string).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
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
    `insert into reviews (payment_id, action, system_status, reviewed_status, note, invoices, customer_id, matcher_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [paymentId, action, rows[0].status, reviewedStatus, note, invoices, customerId, MATCHER_VERSION],
  );
}

export type VersionFinding = {
  paymentId: string;
  status: Status;
  likelyCustomerId: string | null;
  likelyInvoices: string[];
  amount: number;
  evidence: string[];
  flags: Finding["flags"];
  decidedBy: Finding["decidedBy"];
  confidence: Finding["confidence"];
};

export type StoredVersion = { version: string; computedAt: Date; findings: Map<string, VersionFinding> };

// Every stored version with its findings, oldest version first.
export async function listVersions(ledger: Ledger): Promise<StoredVersion[]> {
  await ensureReady(ledger);
  const { rows } = await pool().query("select * from finding_versions order by version, payment_id");
  const versions = new Map<string, StoredVersion>();
  for (const row of rows) {
    const v = versions.get(row.version) ?? { version: row.version, computedAt: row.computed_at, findings: new Map() };
    if (row.computed_at > v.computedAt) v.computedAt = row.computed_at;
    v.findings.set(row.payment_id, {
      paymentId: row.payment_id,
      status: row.status,
      likelyCustomerId: row.likely_customer_id,
      likelyInvoices: row.likely_invoices,
      amount: Number(row.amount_cents),
      evidence: row.evidence,
      flags: row.flags,
      decidedBy: row.decided_by,
      confidence: row.confidence,
    });
    versions.set(row.version, v);
  }
  return [...versions.values()].sort((a, b) => Number(a.version) - Number(b.version) || a.version.localeCompare(b.version));
}
