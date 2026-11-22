import { readFileSync } from "node:fs";
import { loadLedger, formatCents } from "../src/ledger/load";
import { matchAll } from "../src/matcher/match";
import { readEmail } from "../src/email/model";
import { checkEmail } from "../src/email/check";

// Checks one or more pasted emails against the ledger: npm run check-email -- data/emails/*.txt
const ledger = loadLedger();
const findings = matchAll(ledger);

for (const path of process.argv.slice(2)) {
  const read = await readEmail(readFileSync(path, "utf8"), ledger);
  const result = checkEmail(read.claims, ledger, findings);
  console.log(`\n${path}: ${result.outcome} (read by ${read.readBy})`);
  for (const n of read.notes) console.log(`  Note: ${n}`);
  console.log(`  Account: ${result.account ? `${result.account.name} (${result.account.id})` : "unknown"}`);
  for (const w of result.warnings) console.log(`  Warning: ${w}`);
  for (const p of result.payments) console.log(`  ${p.paymentId} [${p.status}] ${p.why.join(" ")}`);
  for (const i of [...result.invoices, ...result.otherOwed]) {
    console.log(`  ${i.invoice} ${i.verdict.padEnd(13)} books ${formatCents(i.recordedBalance).padStart(9)}  corrected ${formatCents(i.correctedBalance).padStart(9)}  ${i.reason}`);
  }
  for (const s of result.summary) console.log(`  > ${s}`);
}
