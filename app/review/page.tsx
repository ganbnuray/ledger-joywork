import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { formatCents } from "@/src/ledger/money";
import { listFindings, type StoredFinding } from "@/src/db/findings";
import { reviewQueue } from "@/src/view/filter";
import { FindingStatus, StatusBadge } from "../ui";
import { ClickableRow } from "../nav";

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
  const unsure = reviewQueue(all);
  const waiting = unsure.filter((f) => f.reviews.length === 0);
  // Latest decision first.
  const reviewed = all
    .filter((f) => f.reviews.length > 0)
    .sort((a, b) => new Date(b.reviews[0].createdAt).getTime() - new Date(a.reviews[0].createdAt).getTime());
  const agree = reviewed.filter((f) => f.reviews[0].reviewedStatus === f.status).length;

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

      <h2>Manual review results</h2>
      {reviewed.length === 0 ? (
        <div className="empty">No decisions saved yet. They appear here as soon as you confirm or correct a finding.</div>
      ) : (
        <>
          <p className="muted">
            Every finding a person has decided, from the queue or from the findings list. {agree} of {reviewed.length} agree
            with the system.
          </p>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>System said</th>
                  <th>Your answer</th>
                  <th>Belongs to</th>
                  <th>Note</th>
                  <th>Saved (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {reviewed.map((f) => {
                  const r = f.reviews[0];
                  const account = r.customerId ? ledger.customerById.get(r.customerId) : null;
                  return (
                    <ClickableRow key={f.paymentId} href={`/findings/${f.paymentId}`}>
                      <td>
                        <Link href={`/findings/${f.paymentId}`} className="row-link">
                          {f.paymentId}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={f.status} />
                      </td>
                      <td>
                        <StatusBadge status={r.reviewedStatus} />
                        {r.reviewedStatus !== f.status && <div className="row-note">Corrected</div>}
                      </td>
                      <td>
                        <span className="mono">{r.invoices.join(", ")}</span>
                        {account && <div className="row-note">{account.name}</div>}
                      </td>
                      <td style={{ fontSize: 13 }}>{r.note}</td>
                      <td className="mono">{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
