import { loadLedger } from "../src/ledger/load";
import { matchAll } from "../src/matcher/match";
import { saveFindings } from "../src/db/findings";

// Reruns the matcher and writes the findings. Reviews already in the database are kept.
const ledger = loadLedger();
const findings = matchAll(ledger);
await saveFindings(findings);
console.log(`Saved ${findings.length} findings.`);
process.exit(0);
