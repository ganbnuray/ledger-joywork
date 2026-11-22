import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { formatCents } from "@/src/ledger/money";
import { listFindings, type StoredFinding } from "@/src/db/findings";
import { needsReview } from "@/src/view/labels";
import { FindingStatus } from "../ui";

export const dynamic = "force-dynamic";

// The first sentence of the evidence that explains the problem, for the queue summary.
function summary(f: StoredFinding): string {
  const key = f.evidence.find((e) => /must|decide|not applied|claims|ignored|duplicate|Same amount/i.test(e));
  return key ?? f.evidence[0] ?? "";
}

function QueueItem({ f }: { f: StoredFinding }) {
  const p = ledger.payments.find((x) => x.id === f.paymentId)!;
  const account = p.customerId ? ledger.customerById.get(p.customerId) : null;
  return (
    <div className="queue-item">
      <div>
        <h3>
          {f.paymentId}
          <FindingStatus finding={f} />
          <span className="muted" style={{ fontWeight: 400 }}>
            {account?.name ?? "No account"} · {p.receivedDate}
          </span>
        </h3>
        <p>{summary(f)}</p>
      </div>
      <div className="queue-side">
        <span className="num" style={{ fontWeight: 600 }}>
          {formatCents(f.amount || p.amount)}
        </span>
        <Link href={`/findings/${f.paymentId}?from=review`} className={f.reviews.length ? "button secondary" : "button"}>
          {f.reviews.length ? "Open" : "Review"}
        </Link>
      </div>
    </div>
  );
}

export default async function ReviewPage() {
  const all = await listFindings(ledger);
  // Biggest amounts first, so the most money at stake gets looked at first.
  const unsure = all.filter(needsReview).sort((a, b) => b.amount - a.amount);
  const waiting = unsure.filter((f) => f.reviews.length === 0);
  const done = unsure.filter((f) => f.reviews.length > 0);

  return (
    <>
      <div className="page-head">
        <h1>Review queue</h1>
        <p className="muted">
          Findings the system is not sure about: everything that needs a person, plus findings with low confidence. Biggest
          amounts first.
        </p>
      </div>

      {waiting.length === 0 ? (
        <div className="notice good">Nothing is waiting. Every unsure finding has been reviewed.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <span>{waiting.length} waiting</span>
            <Link href={`/findings/${waiting[0].paymentId}?from=review`} className="button">
              Start with {waiting[0].paymentId}
            </Link>
          </div>
          <div className="queue">
            {waiting.map((f) => (
              <QueueItem key={f.paymentId} f={f} />
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <h2>Reviewed</h2>
          <div className="queue">
            {done.map((f) => (
              <QueueItem key={f.paymentId} f={f} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
