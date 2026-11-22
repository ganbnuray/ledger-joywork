import { loadLedger } from "../src/ledger/load";
import { matchAll } from "../src/matcher/match";
import { screenMemos } from "../src/matcher/screen";
import { saveFindings } from "../src/db/findings";

// Reruns the matcher, has the model check the memos, and writes the findings.
// Reviews already in the database are kept.
const ledger = loadLedger();
const { findings, notes } = await screenMemos(ledger, matchAll(ledger));
for (const n of notes) console.log(n);
await saveFindings(findings);
console.log(`Saved ${findings.length} findings.`);
process.exit(0);
