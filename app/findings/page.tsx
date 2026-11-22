import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { formatCents } from "@/src/ledger/money";
import { listFindings } from "@/src/db/findings";
import { viewedVersion } from "@/src/view/version";
import { STATUSES, STATUS_HELP, STATUS_LABEL, flagLabel, needsReview } from "@/src/view/labels";
import { effectiveStatus, filterFindings, filterQuery, reviewIsCurrent, type FindingFilter } from "@/src/view/filter";
import type { Status } from "@/src/matcher/match";
import { FindingStatus } from "../ui";
import { ClickableRow } from "../nav";

export const dynamic = "force-dynamic";

export default async function FindingsPage({ searchParams }: { searchParams: Promise<FindingFilter> }) {
  const search = await searchParams;
  const viewed = await viewedVersion(ledger);
  const all = await listFindings(ledger, viewed.version);
  const orgs = [...new Set(ledger.customers.map((c) => c.parent))].sort();
  const filtered = filterFindings(all, search, ledger);
  // Detail links carry the filters, so previous and next stay inside this list.
  const query = filterQuery(search);

  // Status counts ignore the status filter, so they always show the whole picture.
  const countFor = (s: Status) => all.filter((f) => effectiveStatus(f) === s);
  const hrefFor = (s: Status | null) => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (search.org) params.set("org", search.org);
    if (search.review) params.set("review", search.review);
    if (search.q) params.set("q", search.q);
    const qs = params.toString();
    return qs ? `/findings?${qs}` : "/findings";
  };

  const reviewedCount = all.filter((f) => f.reviews.length > 0).length;

  return (
    <>
      <div className="page-head">
        <h1>Findings</h1>
        <p className="muted">
          One finding for each of the {all.length} payments and credits. {reviewedCount} reviewed by a person.
        </p>
      </div>

      <div className="counts">
        {STATUSES.map((s) => {
          const items = countFor(s);
          const money = items.reduce((sum, f) => sum + f.amount, 0);
          return (
            <Link
              key={s}
              href={search.status === s ? hrefFor(null) : hrefFor(s)}
              className={`count${search.status === s ? " active" : ""}`}
              title={STATUS_HELP[s]}
            >
              <div className="count-label">
                <span className={`dot d-${s}`} />
                {STATUS_LABEL[s]}
              </div>
              <div className="count-n">{items.length}</div>
              <div className="count-money">{s === "ok" ? " " : `${formatCents(money)} involved`}</div>
            </Link>
          );
        })}
      </div>

      <form className="filters" method="get">
        <label>
          Status
          <select name="status" defaultValue={search.status ?? ""}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Organization
          <select name="org" defaultValue={search.org ?? ""}>
            <option value="">All</option>
            {orgs.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value="none">No account</option>
          </select>
        </label>
        <label>
          Review
          <select name="review" defaultValue={search.review ?? ""}>
            <option value="">All</option>
            <option value="queue">System unsure</option>
            <option value="unreviewed">Not reviewed</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </label>
        <label>
          Search
          <input name="q" defaultValue={search.q ?? ""} placeholder="PMT-1005, NB-3302, ACH 7781" size={26} />
        </label>
        <button type="submit">Apply</button>
        {(search.status || search.org || search.review || search.q) && (
          <Link href="/findings" className="button secondary">
            Clear
          </Link>
        )}
      </form>

      {filtered.length === 0 ? (
        <div className="empty">No findings match these filters.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payment</th>
                <th>Recorded on</th>
                <th>Received</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Likely belongs to</th>
                <th className="num">Involved</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const p = ledger.payments.find((x) => x.id === f.paymentId)!;
                const account = p.customerId ? ledger.customerById.get(p.customerId) : null;
                const likelyAccount =
                  f.likelyCustomerId && f.likelyCustomerId !== p.customerId ? ledger.customerById.get(f.likelyCustomerId) : null;
                return (
                  <ClickableRow key={f.paymentId} href={`/findings/${f.paymentId}${query}`}>
                    <td>
                      <Link href={`/findings/${f.paymentId}${query}`} className="row-link">
                        {f.paymentId}
                      </Link>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.type === "credit_memo" ? `Credit memo · ${p.reference}` : p.reference}
                      </div>
                    </td>
                    <td>{account ? account.name : <span className="muted">No account</span>}</td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{p.receivedDate}</td>
                    <td className="num">{formatCents(p.amount)}</td>
                    <td>
                      <FindingStatus finding={f} />
                      {needsReview(f) && !reviewIsCurrent(f) && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          Waiting for review
                        </div>
                      )}
                    </td>
                    <td>
                      {f.status === "ok" ? (
                        <span className="muted">As recorded</span>
                      ) : (
                        <>
                          <span className="mono">{f.likelyInvoices.join(", ") || "Unclear"}</span>
                          {likelyAccount && <div className="muted" style={{ fontSize: 12 }}>{likelyAccount.name}</div>}
                        </>
                      )}
                    </td>
                    <td className="num">{f.amount ? formatCents(f.amount) : ""}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {f.flags.map((flag, i) => (
                          <span key={i} className="tag">
                            {flagLabel(flag)}
                          </span>
                        ))}
                      </div>
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
