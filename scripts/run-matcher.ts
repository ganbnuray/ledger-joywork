import { loadLedger, formatCents } from "../src/ledger/load";
import { matchAll } from "../src/matcher/match";
import { screenMemos } from "../src/matcher/screen";

// Prints one line per finding, and the evidence with --verbose.
const ledger = loadLedger();
// With ANTHROPIC_API_KEY set, the model also checks every memo for injection attempts.
const { findings, notes } = await screenMemos(ledger, matchAll(ledger));
const verbose = process.argv.includes("--verbose");

for (const f of findings) {
  const amount = f.amount ? formatCents(f.amount) : "";
  console.log(
    [f.paymentId, f.status.padEnd(13), (f.recordedCustomerId ?? "none").padEnd(6), f.confidence.padEnd(4), amount.padStart(10), f.likelyInvoices.join(" ")].join("  "),
  );
  if (verbose) for (const e of f.evidence) console.log(`      ${e}`);
}

const counts: Record<string, number> = {};
for (const f of findings) counts[f.status] = (counts[f.status] ?? 0) + 1;
console.log("\n", counts);
for (const n of notes) console.log(n);
