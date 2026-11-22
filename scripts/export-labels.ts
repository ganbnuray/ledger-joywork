import { writeFileSync } from "node:fs";
import { exportLabels } from "../src/db/findings";

// Writes my labels (the latest manual review of each payment) to data/labels.json, so they can be committed.
// Needs DATABASE_URL in .env. Without it, use the Download labels.json button on the Evaluation page instead.
const labels = await exportLabels();
writeFileSync("data/labels.json", JSON.stringify(labels, null, 2) + "\n");
console.log(`Wrote ${labels.length} labels to data/labels.json.`);
process.exit(0);
