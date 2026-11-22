import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { formatCents } from "@/src/ledger/money";
import { listFindings, listVersions, type VersionFinding } from "@/src/db/findings";
import { MATCHER_VERSION, versionNote } from "@/src/matcher/versions";
import { STATUSES, STATUS_LABEL } from "@/src/view/labels";
import { StatusBadge } from "../ui";
import { ClickableRow } from "../nav";

export const dynamic = "force-dynamic";

function changes(a: VersionFinding | undefined, b: VersionFinding | undefined): string[] {
  if (!a || !b) return ["Only in one version"];
  const out: string[] = [];
  if (a.status !== b.status) out.push("Status");
  if (a.likelyInvoices.join() !== b.likelyInvoices.join()) out.push("Likely invoices");
  if (a.amount !== b.amount) out.push("Amount");
  if (a.decidedBy !== b.decidedBy) out.push("Decided by");
  if (a.confidence !== b.confidence) out.push("Confidence");
  return out;
}

export default async function VersionsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; all?: string }> }) {
  const search = await searchParams;
  const [versions, current] = await Promise.all([listVersions(ledger), listFindings(ledger)]);
  const names = versions.map((v) => v.version);
  const to = names.includes(search.to ?? "") ? search.to! : (names.at(-1) ?? MATCHER_VERSION);
  const from = names.includes(search.from ?? "") ? search.from! : (names[names.indexOf(to) - 1] ?? names[0]);
  const a = versions.find((v) => v.version === from);
  const b = versions.find((v) => v.version === to);
  const reviews = new Map(current.map((f) => [f.paymentId, f.reviews[0] ?? null]));

  const rows = ledger.payments
    .map((p) => ({ p, a: a?.findings.get(p.id), b: b?.findings.get(p.id) }))
    .map((r) => ({ ...r, changed: changes(r.a, r.b) }));
  const shown = search.all ? rows : rows.filter((r) => r.changed.length > 0);
  const changedCount = rows.filter((r) => r.changed.length > 0).length;

  return (
    <>
      <div className="page-head">
        <h1>System versions</h1>
        <p className="muted">
          Each time a rule or a model prompt changes, the findings of the old version are kept. Compare any two versions
          here. Manual reviews are never removed: each one shows the version it was made under.
        </p>
      </div>

      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table className="compact">
          <thead>
            <tr>
              <th>Version</th>
              <th>What it does</th>
              {STATUSES.map((s) => (
                <th key={s} className="num">
                  {STATUS_LABEL[s]}
                </th>
              ))}
              <th>Computed (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version}>
                <td>
                  <strong>{v.version}</strong>
                  {v.version === MATCHER_VERSION && <div className="row-note">Current</div>}
                </td>
                <td style={{ fontSize: 13, maxWidth: 420 }}>{versionNote(v.version)}</td>
                {STATUSES.map((s) => (
                  <td key={s} className="num">
                    {[...v.findings.values()].filter((f) => f.status === s).length}
                  </td>
                ))}
                <td className="mono">{new Date(v.computedAt).toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="filters" method="get">
        <label>
          Compare version
          <select name="from" defaultValue={from}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          with version
          <select name="to" defaultValue={to}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
                {n === MATCHER_VERSION ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Show
          <select name="all" defaultValue={search.all ?? ""}>
            <option value="">Only what changed ({changedCount})</option>
            <option value="1">All {rows.length} payments</option>
          </select>
        </label>
        <button type="submit">Compare</button>
      </form>

      {versions.length < 2 ? (
        <div className="empty">Only one version is stored so far.</div>
      ) : shown.length === 0 ? (
        <div className="empty">
          Versions {from} and {to} give the same findings for every payment.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Payment</th>
                <th>Version {from}</th>
                <th>Version {to}</th>
                <th>What changed</th>
                <th>Manual review</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, a: fa, b: fb, changed }) => {
                const review = reviews.get(p.id);
                return (
                  <ClickableRow key={p.id} href={`/findings/${p.id}`}>
                    <td>
                      <Link href={`/findings/${p.id}`} className="row-link">
                        {p.id}
                      </Link>
                      <div className="row-note">{formatCents(p.amount)}</div>
                    </td>
                    <td>
                      {fa ? <StatusBadge status={fa.status} /> : <span className="muted">Not stored</span>}
                      {fa && fa.likelyInvoices.length > 0 && <div className="row-note">{fa.likelyInvoices.join(", ")}</div>}
                    </td>
                    <td>
                      {fb ? <StatusBadge status={fb.status} /> : <span className="muted">Not stored</span>}
                      {fb && fb.likelyInvoices.length > 0 && <div className="row-note">{fb.likelyInvoices.join(", ")}</div>}
                    </td>
                    <td style={{ fontSize: 13 }}>{changed.join(", ") || <span className="muted">Nothing</span>}</td>
                    <td>
                      {review ? (
                        <>
                          <StatusBadge status={review.reviewedStatus} />
                          <div className="row-note">
                            {review.matcherVersion ? `Reviewed under version ${review.matcherVersion}` : "Reviewed before versions were kept"}
                          </div>
                        </>
                      ) : (
                        <span className="muted">Not reviewed</span>
                      )}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
