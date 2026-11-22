import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { EmailChecker } from "./EmailChecker";

export const dynamic = "force-dynamic";

function loadExamples() {
  const dir = path.join(process.cwd(), "data", "emails");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".txt"))
      .sort()
      .map((f) => {
        const text = readFileSync(path.join(dir, f), "utf8");
        const name = text.match(/^account:\s*(.+)$/im)?.[1].trim() ?? f;
        return { name, text };
      });
  } catch {
    return [];
  }
}

export default function EmailPage() {
  return (
    <>
      <div className="page-head">
        <h1>Check an email</h1>
        <p className="muted">
          Paste a customer&apos;s &ldquo;we already paid&rdquo; email. The answer comes from the ledger and the findings, never
          from what the email says.
        </p>
      </div>
      <EmailChecker examples={loadExamples()} modelConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </>
  );
}
