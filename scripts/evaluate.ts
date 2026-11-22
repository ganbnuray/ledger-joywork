import { existsSync, readFileSync } from "node:fs";
import { loadLedger } from "../src/ledger/load";
import { matchAll, type Status } from "../src/matcher/match";
import { evaluate } from "../src/eval/metrics";

// Prints precision and recall per status for each version, against data/labels.json.
// Version 2 is shown as the rules give it. The model's memo check can only add needs_human on top.
if (!existsSync("data/labels.json")) {
  console.log("No data/labels.json yet. Export it first: npm run labels:export");
  process.exit(1);
}
const ledger = loadLedger();
const labels = new Map<string, Status>(
  JSON.parse(readFileSync("data/labels.json", "utf8")).map((l: { payment_id: string; status: Status }) => [l.payment_id, l.status]),
);
const versions: [string, Status[]][] = [
  ["1", matchAll(ledger, { holdInjections: false }).map((f) => f.status)],
  ["2", matchAll(ledger).map((f) => f.status)],
];
const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

for (const [version, statuses] of versions) {
  const predicted = new Map(ledger.payments.map((p, i) => [p.id, statuses[i]]));
  const e = evaluate(predicted, labels);
  console.log(`\nVersion ${version}: ${e.agreedCount} of ${e.labeledCount} labels agree\n`);
  console.log("| Status | System said | I labeled | Both | Precision | Recall |");
  console.log("|---|---|---|---|---|---|");
  for (const s of e.scores) console.log(`| ${s.status} | ${s.predicted} | ${s.labeled} | ${s.agreed} | ${pct(s.precision)} | ${pct(s.recall)} |`);
  if (e.disagreements.length) console.log(`\nDisagreements: ${e.disagreements.map((d) => `${d.paymentId} (system ${d.predicted}, label ${d.label})`).join(", ")}`);
}
