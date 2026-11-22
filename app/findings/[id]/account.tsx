import Link from "next/link";
import { ledger } from "@/src/ledger/bundled";
import { formatCents } from "@/src/ledger/money";
import type { Customer } from "@/src/ledger/types";
import type { InvoiceBalance } from "@/src/ledger/balances";
import type { StoredFinding } from "@/src/db/findings";
import { STATUS_LABEL } from "@/src/view/labels";
import { ClickableRow } from "../../nav";

type Balances = Map<string, InvoiceBalance>;

function balanceText(b: InvoiceBalance): string {
  if (b.state === "void") return "Void";
  if (b.balance <= 0) return b.balance < 0 ? `Overpaid ${formatCents(-b.balance)}` : "Paid";
  return `${formatCents(b.balance)} open`;
}

// Every invoice on one account, with what the books say and what they say after the fixes.
// Invoices this payment touches are marked, so the reader sees where its money is and should be.
export function InvoicesTable({
  account,
  recorded,
  corrected,
  recordedHere,
  meantHere,
}: {
  account: Customer;
  recorded: Balances;
  corrected: Balances;
  recordedHere: Set<string>;
  meantHere: Set<string>;
}) {
  const invoices = ledger.invoices
    .filter((inv) => inv.customerId === account.id)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Due</th>
            <th className="num">Amount</th>
            <th className="num">Books say</th>
            <th className="num">After fixes</th>
            <th>This payment</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const r = recorded.get(inv.number)!;
            const c = corrected.get(inv.number)!;
            const changed = r.balance !== c.balance;
            const touched = recordedHere.has(inv.number) || meantHere.has(inv.number);
            return (
              <tr key={inv.number} className={touched ? "highlight" : undefined}>
                <td>
                  <span className="mono">{inv.number}</span>
                  {inv.status === "void" && (
                    <span className="tag" style={{ marginLeft: 6 }}>
                      Void
                    </span>
                  )}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {inv.description}
                  </div>
                </td>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>
                  {inv.dueDate}
                </td>
                <td className="num">{formatCents(inv.amount)}</td>
                <td className="num">{balanceText(r)}</td>
                <td className="num" style={changed ? { fontWeight: 600 } : { color: "var(--muted)" }}>
                  {balanceText(c)}
                </td>
                <td style={{ fontSize: 13 }}>
                  {recordedHere.has(inv.number) && !meantHere.has(inv.number) && "Recorded here, belongs elsewhere"}
                  {meantHere.has(inv.number) && !recordedHere.has(inv.number) && "Belongs here, not recorded"}
                  {meantHere.has(inv.number) && recordedHere.has(inv.number) && "Recorded here"}
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
      <table>
        <thead>
          <tr>
            <th>Payment</th>
            <th>Received</th>
            <th className="num">Amount</th>
            <th>Memo</th>
            <th>Recorded against</th>
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
