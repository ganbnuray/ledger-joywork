"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatCents } from "@/src/ledger/money";
import type { InvoiceCheck } from "@/src/email/check";
import { STATUS_LABEL, VERDICT_LABEL } from "@/src/view/labels";
import { checkEmailAction, type EmailState } from "../actions";

const OUTCOME: Record<string, { label: string; tone: string }> = {
  customer_right: { label: "The customer is right", tone: "good" },
  partly_right: { label: "The customer is partly right", tone: "warn" },
  not_supported: { label: "The ledger does not support the claim", tone: "bad" },
  needs_human: { label: "A person has to decide first", tone: "bad" },
  nothing_to_check: { label: "Nothing in the email can be checked", tone: "warn" },
};

function InvoiceTable({ rows }: { rows: InvoiceCheck[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th className="num">Books say</th>
            <th className="num">After fixes</th>
            <th>Answer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.invoice}>
              <td>
                <span className="mono">{i.invoice}</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  {i.description}
                </div>
              </td>
              <td className="num">{i.recordedBalance > 0 ? `${formatCents(i.recordedBalance)} open` : "Paid"}</td>
              <td className="num">{i.correctedBalance > 0 ? `${formatCents(i.correctedBalance)} open` : "Paid"}</td>
              <td>
                <span className={`badge v-${i.verdict}`}>{VERDICT_LABEL[i.verdict]}</span>
                <div style={{ fontSize: 13, marginTop: 4 }}>{i.reason}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function list(values: string[]) {
  return values.length ? values.join(", ") : <span className="muted">None</span>;
}

function Result({ state }: { state: NonNullable<EmailState> }) {
  const { read, result } = state;
  const c = result.claims;
  const outcome = OUTCOME[result.outcome];
  return (
    <div>
      <div className={`notice ${outcome.tone}`}>
        <strong>{outcome.label}</strong>
        {result.summary.map((s, i) => (
          <p key={i} style={{ margin: "4px 0 0" }}>
            {s}
          </p>
        ))}
      </div>

      {result.warnings.length > 0 && (
        <div className="notice warn">
          {result.warnings.map((w, i) => (
            <p key={i} style={{ margin: i ? "4px 0 0" : 0 }}>
              {w}
            </p>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: 0 }}>Account</h2>
      <p>{result.account ? `${result.account.name} (${result.account.id})` : "Unknown"}</p>
      {result.accountEvidence.map((e, i) => (
        <p key={i} className="muted" style={{ fontSize: 13 }}>
          {e}
        </p>
      ))}

      {result.invoices.length > 0 && (
        <>
          <h2>Invoices the email is about</h2>
          <InvoiceTable rows={result.invoices} />
        </>
      )}

      {result.otherOwed.length > 0 && (
        <>
          <h2>Also open on this account</h2>
          <InvoiceTable rows={result.otherOwed} />
        </>
      )}

      <h2>Payments that match the email</h2>
      {result.payments.length === 0 ? (
        <div className="empty">No payment in the ledger matches what the email says.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Payment</th>
              <th>Finding</th>
              <th>Why it matches</th>
            </tr>
          </thead>
          <tbody>
            {result.payments.map((p) => (
              <tr key={p.paymentId}>
                <td>
                  <Link href={`/findings/${p.paymentId}`} className="row-link">
                    {p.paymentId}
                  </Link>
                </td>
                <td>
                  <span className={`badge s-${p.status}`}>
                    <span className={`dot d-${p.status}`} />
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td>{p.why.join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>What the email claims</h2>
      <dl className="claims">
        <dt>Sender</dt>
        <dd>{c.senderEmail ?? <span className="muted">Unknown</span>}</dd>
        <dt>Invoices</dt>
        <dd className="mono">{list(c.invoiceRefs)}</dd>
        <dt>Payment references</dt>
        <dd className="mono">{list(c.paymentRefs)}</dd>
        <dt>Dates</dt>
        <dd className="mono">{list(c.dates)}</dd>
        <dt>Amounts</dt>
        <dd>{list(c.amounts.map(formatCents))}</dd>
        <dt>Billing months</dt>
        <dd className="mono">{list(c.periods)}</dd>
        <dt>Paid through</dt>
        <dd className="mono">{c.paidThrough ?? <span className="muted">Not said</span>}</dd>
        <dt>Mentions a credit</dt>
        <dd>{c.mentionsCredit ? "Yes" : "No"}</dd>
      </dl>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Read by {read.readBy === "rules" ? "rules only" : "rules and the model"}.{" "}
        {read.notes.join(" ")}
      </p>
    </div>
  );
}

export function EmailChecker({
  examples,
  modelConfigured,
}: {
  examples: { name: string; text: string }[];
  modelConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(checkEmailAction, null);
  const [text, setText] = useState("");

  return (
    <div className="email-layout">
      <form action={action}>
        <textarea
          name="email"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"From: ap@customer.example\n\nHi, we paid invoice NB-3302 on September 1..."}
        />
        <div className="examples">
          <span className="muted" style={{ alignSelf: "center" }}>
            Examples:
          </span>
          {examples.map((ex) => (
            <button key={ex.name} type="button" className="secondary" onClick={() => setText(ex.text)}>
              {ex.name}
            </button>
          ))}
        </div>
        <button type="submit" disabled={pending || text.trim() === ""}>
          {pending ? "Checking..." : "Check against the ledger"}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          {modelConfigured
            ? "The model helps read the email. Rules read it too, and the ledger decides the answer."
            : "No model key is configured, so the email is read with rules only."}
        </p>
      </form>

      <div>
        {state ? (
          <Result state={state} />
        ) : (
          <div className="empty">Paste an email or pick an example, then check it.</div>
        )}
      </div>
    </div>
  );
}
