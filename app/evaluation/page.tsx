import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { listFindings } from "@/src/db/findings";
import { evaluate } from "@/src/eval/metrics";
import { STATUSES, STATUS_LABEL } from "@/src/view/labels";
import { viewedVersion } from "@/src/view/version";
import type { Status } from "@/src/matcher/match";
import { StatusBadge } from "../ui";
import { ClickableRow } from "../nav";

export const dynamic = "force-dynamic";

function percent(x: number | null): string {
  return x === null ? "n/a" : `${Math.round(x * 100)}%`;
}

export default async function EvaluationPage() {
  const viewed = await viewedVersion(ledger);
  const findings = await listFindings(ledger, viewed.version);

  // My label for a payment is my latest manual review of it.
  const labels = new Map<string, Status>();
  for (const f of findings) if (f.reviews[0]) labels.set(f.paymentId, f.reviews[0].reviewedStatus);
  const predicted = new Map(findings.map((f) => [f.paymentId, f.status]));
  const e = evaluate(predicted, labels);

  return (
    <>
      <div className="page-head">
        <h1>Evaluation</h1>
        <p className="muted">
          Version {viewed.version} compared with my labels. A label is my latest manual review of a payment.{" "}
          {e.labeledCount} of {findings.length} payments are labeled, and the system agrees on {e.agreedCount}. Switch the
          version in the top bar to score another version against the same labels.
        </p>
        {e.labeledCount > 0 && (
          <p style={{ marginTop: 10 }}>
            <a href="/evaluation/labels.json" className="button secondary" download>
              Download labels.json
            </a>
            <span className="muted" style={{ fontSize: 13, marginLeft: 10 }}>
              Save it as data/labels.json in the repo and commit it.
            </span>
          </p>
        )}
      </div>

      {e.labeledCount === 0 ? (
        <div className="empty">No labels yet. Review payments to label them.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>Status</th>
                  <th className="num">System said</th>
                  <th className="num">I labeled</th>
                  <th className="num">Both</th>
                  <th className="num">Precision</th>
                  <th className="num">Recall</th>
                </tr>
              </thead>
              <tbody>
                {e.scores.map((s) => (
                  <tr key={s.status}>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="num">{s.predicted}</td>
                    <td className="num">{s.labeled}</td>
                    <td className="num">{s.agreed}</td>
                    <td className="num">{percent(s.precision)}</td>
                    <td className="num">{percent(s.recall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Precision: of the payments the system gave this status, how many I labeled the same. Recall: of the payments I
            labeled with this status, how many the system found. n/a means the count it divides by is zero.
          </p>

          <h2>Confusion table</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Rows are my labels, columns are what the system said. The diagonal is agreement.
          </p>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>My label</th>
                  {STATUSES.map((s) => (
                    <th key={s} className="num">
                      {STATUS_LABEL[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((l) => (
                  <tr key={l}>
                    <td>
                      <StatusBadge status={l} />
                    </td>
                    {STATUSES.map((p) => (
                      <td key={p} className="num" style={l === p ? { fontWeight: 600 } : e.confusion[l][p] ? { color: "var(--needs_human)" } : { color: "var(--faint)" }}>
                        {e.confusion[l][p]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Where we disagree</h2>
          {e.disagreements.length === 0 ? (
            <div className="empty">The system agrees with every label.</div>
          ) : (
            <div className="table-wrap">
              <table className="compact">
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>System said</th>
                    <th>My label</th>
                    <th>My note</th>
                  </tr>
                </thead>
                <tbody>
                  {e.disagreements.map((d) => {
                    const f = findings.find((x) => x.paymentId === d.paymentId)!;
                    return (
                      <ClickableRow key={d.paymentId} href={`/findings/${d.paymentId}`}>
                        <td>
                          <Link href={`/findings/${d.paymentId}`} className="row-link">
                            {d.paymentId}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={d.predicted} />
                        </td>
                        <td>
                          <StatusBadge status={d.label} />
                        </td>
                        <td style={{ fontSize: 13 }}>{f.reviews[0]?.note}</td>
                      </ClickableRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
