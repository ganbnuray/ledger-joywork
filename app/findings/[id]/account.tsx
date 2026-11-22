import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { formatCents } from "@/src/ledger/money";
import type { Customer } from "@/src/ledger/types";
import type { InvoiceBalance } from "@/src/ledger/balances";
import type { StoredFinding } from "@/src/db/findings";
import { STATUS_LABEL } from "@/src/view/labels";
import { ClickableRow } from "../../nav";

type Balances = Map<string, InvoiceBalance>;

function BalanceCell({ b }: { b: InvoiceBalance }) {
  if (b.state === "void") return <span className="muted">Void</span>;
  return <span className={b.balance > 0 ? "owed" : "settled"}>{formatCents(b.balance)}</span>;
}

// Every invoice on one account: what was applied, what is left, and which payments paid it.
// "After fixes" only shows a value when the matcher's fixes would change the balance.
// Invoices this payment touches are highlighted.
export function InvoicesTable({
  account,
  recorded,
  corrected,
  recordedHere,
  meantHere,
  query,
}: {
  account: Customer;
  recorded: Balances;
  corrected: Balances;
  recordedHere: Set<string>;
  meantHere: Set<string>;
  query: string;
}) {
  const invoices = ledger.invoices
    .filter((inv) => inv.customerId === account.id)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));

  return (
    <div className="table-wrap">
      <table className="compact">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Issued</th>
            <th className="num">Amount</th>
            <th className="num">Applied</th>
            <th className="num">Balance</th>
            <th className="num">After fixes</th>
            <th>Paid by</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const r = recorded.get(inv.number)!;
            const c = corrected.get(inv.number)!;
            const touched = recordedHere.has(inv.number) || meantHere.has(inv.number);
            const paidBy = ledger.payments.filter((p) => p.applications.some((a) => a.invoice === inv.number));
            let note = "";
            if (recordedHere.has(inv.number) && !meantHere.has(inv.number)) note = "Recorded here, belongs elsewhere";
            if (meantHere.has(inv.number) && !recordedHere.has(inv.number)) note = "Belongs here, not recorded";
            return (
              <tr key={inv.number} className={touched ? "highlight" : undefined} title={inv.description}>
                <td className="mono">
                  {inv.number}
                  {inv.status === "void" && (
                    <span className="tag" style={{ marginLeft: 6 }}>
                      Void
                    </span>
                  )}
                  {note && <div className="row-note">{note}</div>}
                </td>
                <td className="mono">{inv.issueDate}</td>
                <td className="num">{formatCents(inv.amount)}</td>
                <td className="num">{formatCents(r.applied)}</td>
                <td className="num">
                  <BalanceCell b={r} />
                </td>
                <td className="num">{c.balance !== r.balance ? <BalanceCell b={c} /> : ""}</td>
                <td className="mono">
                  {paidBy.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ", "}
                      <Link href={`/findings/${p.id}${query}`}>{p.id}</Link>
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The other payments and credits recorded on an account, newest last.
export function PaymentsTable({
  account,
  currentId,
  findings,
  query,
}: {
  account: Customer;
  currentId: string;
  findings: Map<string, StoredFinding>;
  query: string;
}) {
  const payments = ledger.payments
    .filter((p) => p.customerId === account.id && p.id !== currentId)
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));

  if (payments.length === 0) return <div className="empty">No other payments on this account.</div>;

  return (
    <div className="table-wrap">
      <table className="compact">
        <thead>
          <tr>
            <th>Payment</th>
            <th>Date</th>
            <th className="num">Amount</th>
            <th>Memo</th>
            <th>Applied to</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const f = findings.get(p.id)!;
            const status = f.reviewedStatus ?? f.status;
            return (
              <ClickableRow key={p.id} href={`/findings/${p.id}${query}`}>
                <td>
                  <Link href={`/findings/${p.id}${query}`} className="row-link">
                    {p.id}
                  </Link>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {p.type === "credit_memo" ? `Credit memo · ${p.reference}` : p.reference}
                  </div>
                </td>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>
                  {p.receivedDate}
                </td>
                <td className="num">{formatCents(p.amount)}</td>
                <td style={{ fontSize: 13, maxWidth: 260, wordBreak: "break-word" }}>
                  {p.memo || <span className="muted">No memo</span>}
                </td>
                <td className="mono">
                  {p.applications.map((a) => a.invoice).join(", ") || <span className="muted">Nothing</span>}
                </td>
                <td>
                  <span className={`badge s-${status}`}>
                    <span className={`dot d-${status}`} />
                    {STATUS_LABEL[status]}
                  </span>
                </td>
              </ClickableRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
