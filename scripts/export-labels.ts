import { writeFileSync } from "node:fs";
import { Pool } from "pg";

// Writes my labels (the latest manual review of each payment) to data/labels.json, so they can be committed.
// Run with the database that holds the reviews: npm run labels:export
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });

const { rows } = await pool.query(
  `select distinct on (payment_id) payment_id, reviewed_status, invoices, customer_id, note, system_status,
     matcher_version, created_at
   from reviews order by payment_id, created_at desc, id desc`,
);
const labels = rows.map((r) => ({
  payment_id: r.payment_id,
  status: r.reviewed_status,
  invoices: r.invoices ?? [],
  customer_id: r.customer_id,
  note: r.note,
  system_status_at_review: r.system_status,
  reviewed_under_version: r.matcher_version,
  reviewed_at: new Date(r.created_at).toISOString(),
}));
writeFileSync("data/labels.json", JSON.stringify(labels, null, 2) + "\n");
console.log(`Wrote ${labels.length} labels to data/labels.json.`);
await pool.end();
