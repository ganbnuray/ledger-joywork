import { describe, expect, it } from "vitest";
import { loadLedger, toCents } from "../src/ledger/load";
import { computeBalances, recordedBalances } from "../src/ledger/balances";
import { parseMemo } from "../src/matcher/memo";
import { intendedApplicationsFor, matchAll, type Finding } from "../src/matcher/match";

const ledger = loadLedger();
const findings = matchAll(ledger);
const finding = (id: string): Finding => findings.find((f) => f.paymentId === id)!;

describe("loading", () => {
  it("keeps money in integer cents", () => {
    expect(toCents(310.75)).toBe(31075);
    expect(ledger.invoiceByNumber.get("NB-3107")!.amount).toBe(31075);
  });

  it("gives every payment and credit exactly one finding", () => {
    expect(findings).toHaveLength(38);
    expect(new Set(findings.map((f) => f.paymentId)).size).toBe(38);
  });
});

describe("recorded balances", () => {
  const balances = recordedBalances(ledger);

  it("shows partial invoices", () => {
    expect(balances.get("NB-3208")!.balance).toBe(toCents(120));
    expect(balances.get("NB-3601")!.balance).toBe(toCents(410));
  });

  it("marks void invoices as void, never as owed", () => {
    expect(balances.get("NB-3512")!.state).toBe("void");
  });
});

describe("memo parsing", () => {
  it("ignores numbers that are not invoices", () => {
    expect(parseMemo("PO 5512 / NB-3106", ledger).invoiceRefs).toEqual(["NB-3106"]);
  });

  it("reads month names", () => {
    expect(parseMemo("Sep + Oct", ledger).periods).toEqual(["2026-09", "2026-10"]);
    expect(parseMemo("Inv NB-3401 Sept service", ledger).periods).toEqual(["2026-09"]);
  });

  it("reads location names of sister accounts", () => {
    expect(parseMemo("Eastgate - Aug NB-3302", ledger).locationAccountIds).toEqual(["C-102"]);
    expect(parseMemo("Marlowe Airport - NB-3210", ledger).locationAccountIds).toEqual(["C-110"]);
  });

  it("does not flag ordinary memos as suspicious", () => {
    for (const p of ledger.payments.filter((p) => p.id !== "PMT-1035")) {
      expect(parseMemo(p.memo, ledger).suspicious, p.id).toBe(false);
    }
  });
});

describe("statuses for the cases we discussed", () => {
  const cases: [string, Finding["status"], string][] = [
    ["PMT-1003", "misapplied", "wrong month: September paid, August recorded"],
    ["PMT-1027", "misapplied", "wrong month: September paid, November recorded"],
    ["PMT-1023", "misapplied", "Orchard chain: August paid, July recorded"],
    ["PMT-1024", "misapplied", "Orchard chain: Sep and Oct paid, Aug and Sep recorded"],
    ["PMT-1037", "misapplied", "applied twice the amount received"],
    ["PMT-1038", "misapplied", "applied to a void invoice"],
    ["PMT-1005", "wrong_account", "Eastgate payment recorded on the head office"],
    ["PMT-1029", "wrong_account", "Airport payment recorded on Downtown"],
    ["PMT-1032", "wrong_account", "Downtown payment recorded on Airport"],
    ["PMT-1011", "unapplied", "storm credit never applied"],
    ["PMT-1014", "unapplied", "two months paid, one applied"],
    ["PMT-1035", "unapplied", "unapplied money with a suspicious memo"],
    ["PMT-1021", "needs_human", "duplicate of PMT-1020"],
    ["PMT-1026", "needs_human", "short payment with a claimed discount"],
    ["PMT-1033", "needs_human", "wire with no account"],
    ["PMT-1012", "ok", "empty memo, nothing suggests otherwise"],
    ["PMT-1017", "ok", "empty memo, nothing suggests otherwise"],
    ["PMT-1013", "ok", "same card as PMT-1012 is not a duplicate"],
    ["PMT-1018", "ok", "PO number next to the invoice number"],
    ["PMT-1009", "ok", "one payment for two invoices"],
  ];

  for (const [id, status, why] of cases) {
    it(`${id} is ${status} (${why})`, () => {
      expect(finding(id).status).toBe(status);
    });
  }
});

describe("details of findings", () => {
  it("names the replacement of a void invoice", () => {
    expect(finding("PMT-1038").likelyInvoices).toEqual(["NB-3520"]);
  });

  it("names the sister account for wrong_account", () => {
    expect(finding("PMT-1005").likelyCustomerId).toBe("C-102");
    expect(finding("PMT-1005").likelyInvoices).toEqual(["NB-3302"]);
  });

  it("flags applications to invoices issued after the payment arrived", () => {
    expect(finding("PMT-1005").flags.some((f) => f.kind === "future_invoice")).toBe(true);
    expect(finding("PMT-1027").flags.some((f) => f.kind === "future_invoice")).toBe(true);
  });

  it("reports only the unapplied part of a partial payment", () => {
    expect(finding("PMT-1014").amount).toBe(toCents(415.5));
    expect(finding("PMT-1014").likelyInvoices).toEqual(["NB-3504"]);
  });

  it("suggests a split for the wire with no account, but leaves the decision to a person", () => {
    const f = finding("PMT-1033");
    expect(f.likelyInvoices).toEqual(["NB-3509", "NB-3510"]);
    expect(f.confidence).toBe("low");
  });

  it("does not take the suspicious memo's word for anything", () => {
    const f = finding("PMT-1035");
    expect(f.flags.some((x) => x.kind === "suspicious_memo")).toBe(true);
    expect(f.amount).toBe(toCents(689));
  });

  it("sends every needs_human finding to review with low confidence", () => {
    for (const f of findings.filter((f) => f.status === "needs_human")) expect(f.confidence).toBe("low");
  });
});

describe("corrected balances", () => {
  const corrected = computeBalances(ledger, intendedApplicationsFor(ledger, findings));

  it("Orchard Lane: October is paid and July is still owed", () => {
    for (const n of ["NB-3507", "NB-3557"]) expect(corrected.get(n)!.state, n).toBe("paid");
    for (const n of ["NB-3207", "NB-3257"]) expect(corrected.get(n)!.state, n).toBe("open");
  });

  it("Juniper: the storm credit covers September", () => {
    expect(corrected.get("NB-3403")!.state).toBe("paid");
  });

  it("Lakeshore: September is owed once the double application is removed", () => {
    expect(corrected.get("NB-3412")!.state).toBe("open");
    expect(corrected.get("NB-3520")!.state).toBe("paid");
  });

  it("never leaves an invoice overpaid", () => {
    for (const b of corrected.values()) expect(b.state, b.invoice).not.toBe("overpaid");
  });
});
