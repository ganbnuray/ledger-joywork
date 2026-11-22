import Link from "next/link";
import { notFound } from "next/navigation";
import { ledger } from "@/src/ledger/bundled";
import { formatCents } from "@/src/ledger/money";
import type { Application } from "@/src/ledger/types";
import { listFindings } from "@/src/db/findings";
import { STATUSES, STATUS_HELP, STATUS_LABEL, flagLabel, needsReview } from "@/src/view/labels";
import { filterFindings, filterQuery, reviewQueue, type FindingFilter } from "@/src/view/filter";
import { reviewFinding } from "../../actions";
import { FindingStatus, StatusBadge } from "../../ui";
import { Pager } from "../../nav";
import { computeBalances, recordedBalances } from "@/src/ledger/balances";
import { intendedApplicationsFor } from "@/src/matcher/match";
import { InvoicesTable, PaymentsTable } from "./account";

export const dynamic = "force-dynamic";

function ApplicationsTable({ applications, empty }: { applications: Application[]; empty: string }) {
  if (applications.length === 0) return <div className="empty">{empty}</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Account</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {applications.map((a, i) => {
          const inv = ledger.invoiceByNumber.get(a.invoice);
          const account = inv ? ledger.customerById.get(inv.customerId) : null;
          return (
            <tr key={i}>
              <td>
                <span className="mono">{a.invoice}</span>
                {inv?.status === "void" && (
                  <span className="tag" style={{ marginLeft: 6 }}>
                    Void
                  </span>
                )}
                <div className="muted" style={{ fontSize: 12 }}>
                  {inv?.description ?? "Not in the ledger"}
                </div>
              </td>
              <td>{account?.name ?? ""}</td>
              <td className="num">{formatCents(a.amount)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function FindingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FindingFilter & { from?: string }>;
}) {
  const { id } = await params;
  const { from, ...filter } = await searchParams;
  const all = await listFindings(ledger);
  const finding = all.find((f) => f.paymentId === id);
  const payment = ledger.payments.find((p) => p.id === id);
  if (!finding || !payment) notFound();

  const account = payment.customerId ? ledger.customerById.get(payment.customerId) : null;
  const likelyAccount = finding.likelyCustomerId ? ledger.customerById.get(finding.likelyCustomerId) : null;
  const suspicious = finding.flags.some((f) => f.kind === "suspicious_memo");
  const fromReview = from === "review";

  const queue = fromReview ? all.filter((f) => needsReview(f) && f.reviews.length === 0) : [];

  // Previous and next follow the list the person came from: the review queue, or the filtered findings.
  const query = fromReview ? "?from=review" : filterQuery(filter);
  const list = fromReview ? reviewQueue(all) : filterFindings(all, filter, ledger);
  const index = list.findIndex((f) => f.paymentId === id);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  const listName = fromReview ? "in the review queue" : query ? "in this filtered list" : "";

  // The account to show context for: where it was recorded, or where it most likely belongs.
  const firstLikely = finding.likelyInvoices.map((n) => ledger.invoiceByNumber.get(n)).find(Boolean);
  const homeAccount = account ?? likelyAccount ?? (firstLikely ? ledger.customerById.get(firstLikely.customerId) : null);
  const sisters = homeAccount ? ledger.customers.filter((c) => c.parent === homeAccount.parent && c.id !== homeAccount.id) : [];

  const byId = new Map(all.map((f) => [f.paymentId, f]));
  const recorded = recordedBalances(ledger);
  const corrected = computeBalances(ledger, intendedApplicationsFor(ledger, all));
  const recordedHere = new Set(payment.applications.map((a) => a.invoice));
  const meantHere = new Set(
    finding.status === "ok"
      ? payment.applications.map((a) => a.invoice)
      : (finding.intendedApplications?.map((a) => a.invoice) ?? finding.likelyInvoices),
  );
  const backHref = fromReview ? "/review" : `/findings${query}`;

  return (
    <>
      <div className="detail-top">
        <Link href={backHref} className="back">
          ← {fromReview ? "Review queue" : query ? "Filtered findings" : "All findings"}
        </Link>
        {index >= 0 && (
          <Pager
            prevHref={prev ? `/findings/${prev.paymentId}${query}` : null}
            nextHref={next ? `/findings/${next.paymentId}${query}` : null}
            prevLabel={prev?.paymentId ?? null}
            nextLabel={next?.paymentId ?? null}
            position={`${index + 1} of ${list.length} ${listName}`.trim()}
          />
        )}
      </div>

      <div className="detail-head">
        <h1>{payment.id}</h1>
        <FindingStatus finding={finding} />
        {finding.confidence === "low" && <span className="tag">System unsure</span>}
        {fromReview && queue.length > 0 && (
          <span className="muted">
            {queue.length} not reviewed yet
          </span>
        )}
      </div>
      <p className="muted">{STATUS_HELP[finding.status]}</p>

      <div className="facts">
        <div className="fact">
          <div className="fact-label">Type</div>
          {payment.type === "credit_memo" ? "Credit memo" : "Payment"}
        </div>
        <div className="fact">
          <div className="fact-label">Recorded on</div>
          {account ? `${account.name} (${account.id})` : "No account"}
        </div>
        <div className="fact">
          <div className="fact-label">Received</div>
          <span className="mono">{payment.receivedDate}</span>
        </div>
        <div className="fact">
          <div className="fact-label">Amount</div>
          <span className="num">{formatCents(payment.amount)}</span>
        </div>
        <div className="fact">
          <div className="fact-label">Reference</div>
          {payment.reference}
        </div>
        {finding.status !== "ok" && (
          <div className="fact">
            <div className="fact-label">Amount involved</div>
            <span className="num">{formatCents(finding.amount)}</span>
          </div>
        )}
      </div>

      <h2>Customer memo</h2>
      <div className={`memo${suspicious ? " suspicious" : ""}`}>
        <div className="memo-label">
          {suspicious
            ? "Written by the customer. It tries to instruct the system, so it was ignored as evidence."
            : "Written by the customer. Treated as evidence of intent, never as an instruction."}
        </div>
        {payment.memo || <span className="muted">No memo</span>}
      </div>

      <h2>Where the money is and where it belongs</h2>
      <div className="split">
        <div>
          <p className="muted">Applications: where the books record it</p>
          <ApplicationsTable applications={payment.applications} empty="Not applied to any invoice." />
        </div>
        <div>
          <p className="muted">
            Most likely belongs to
            {likelyAccount && likelyAccount.id !== payment.customerId ? ` (${likelyAccount.name})` : ""}
          </p>
          {finding.status === "ok" ? (
            <div className="empty">Same as recorded.</div>
          ) : finding.intendedApplications ? (
            <ApplicationsTable applications={finding.intendedApplications} empty="" />
          ) : (
            <div className="empty">
              {finding.likelyInvoices.length > 0
                ? `Related to ${finding.likelyInvoices.join(", ")}. A person has to decide where the money goes.`
                : "The data does not say. A person has to decide."}
            </div>
          )}
        </div>
      </div>

      <h2>Evidence</h2>
      <ul className="evidence">
        {finding.evidence.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      {finding.flags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {finding.flags.map((f, i) => (
            <span key={i} className="tag">
              {flagLabel(f)}
            </span>
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        Decided by {finding.decidedBy === "rule" ? "rules in code" : "the model"}, confidence {finding.confidence}.
      </p>

      {homeAccount && (
        <>
          <h2>
            Invoices on {homeAccount.name} ({homeAccount.id})
          </h2>
          {!account && (
            <p className="muted">No account was recorded for this payment. Showing the account it most likely belongs to.</p>
          )}
          <p className="muted" style={{ fontSize: 13 }}>
            &ldquo;After fixes&rdquo; is the balance once every misapplied, wrong account and unapplied finding is corrected.
            Highlighted rows are where this payment is recorded or belongs.
          </p>
          <InvoicesTable
            account={homeAccount}
            recorded={recorded}
            corrected={corrected}
            recordedHere={recordedHere}
            meantHere={meantHere}
          />

          <h2>Other payments on {homeAccount.name}</h2>
          <PaymentsTable account={homeAccount} currentId={payment.id} findings={byId} query={query} />

          {sisters.length > 0 && (
            <>
              <h2>Sister locations in {homeAccount.parent}</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                Other accounts of the same organization. Money often lands on the wrong one.
              </p>
              {sisters.map((s) => {
                const touched = ledger.invoices.some(
                  (inv) => inv.customerId === s.id && (recordedHere.has(inv.number) || meantHere.has(inv.number)),
                );
                const open = ledger.invoices.filter(
                  (inv) => inv.customerId === s.id && inv.status === "posted" && corrected.get(inv.number)!.balance > 0,
                );
                const owed = open.reduce((sum, inv) => sum + corrected.get(inv.number)!.balance, 0);
                return (
                  <details key={s.id} className="sister" open={touched}>
                    <summary>
                      <span style={{ fontWeight: 500 }}>
                        {s.name} ({s.id})
                      </span>
                      <span className="muted">
                        {open.length} open after fixes, {formatCents(owed)}
                      </span>
                      {touched && <span className="tag">This payment belongs here</span>}
                    </summary>
                    <div className="sister-body">
                      <p className="muted">Invoices</p>
                      <InvoicesTable
                        account={s}
                        recorded={recorded}
                        corrected={corrected}
                        recordedHere={recordedHere}
                        meantHere={meantHere}
                      />
                      <p className="muted" style={{ marginTop: 14 }}>
                        Payments
                      </p>
                      <PaymentsTable account={s} currentId={payment.id} findings={byId} query={query} />
                    </div>
                  </details>
                );
              })}
            </>
          )}
        </>
      )}

      <h2>Review</h2>
      <div className="panel">
        <form action={reviewFinding} className="review-form">
          <input type="hidden" name="paymentId" value={finding.paymentId} />
          <input type="hidden" name="systemStatus" value={finding.status} />
          {fromReview ? <input type="hidden" name="from" value="review" /> : <input type="hidden" name="query" value={query} />}
          <p>
            The system says <StatusBadge status={finding.status} />. Confirm it, or pick the status you think is right.
          </p>
          <div className="row">
            <label>
              Correct status
              <select name="status" defaultValue={finding.reviewedStatus ?? finding.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: 220 }}>
              Note (optional)
              <input name="note" placeholder="Why, or what you checked" />
            </label>
          </div>
          <div className="row">
            <button type="submit" name="action" value="confirm">
              Confirm {STATUS_LABEL[finding.status]}
            </button>
            <button type="submit" name="action" value="correct" className="secondary">
              Save corrected status
            </button>
            {fromReview && (
              <Link href="/review" className="button secondary">
                Back to queue
              </Link>
            )}
          </div>
        </form>
      </div>

      {finding.reviews.length > 0 && (
        <>
          <h2>Review history</h2>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {finding.reviews.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{r.action === "confirm" ? "Confirmed" : `Corrected from ${STATUS_LABEL[r.systemStatus]}`}</td>
                  <td>
                    <StatusBadge status={r.reviewedStatus} />
                  </td>
                  <td>{r.note || <span className="muted">No note</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
