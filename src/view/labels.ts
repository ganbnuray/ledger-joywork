import type { Status } from "../matcher/match";
import type { Flag } from "../matcher/flags";
import type { Verdict } from "../email/check";

export const STATUSES: Status[] = ["ok", "misapplied", "wrong_account", "unapplied", "needs_human"];

export const STATUS_LABEL: Record<Status, string> = {
  ok: "OK",
  misapplied: "Misapplied",
  wrong_account: "Wrong account",
  unapplied: "Unapplied",
  needs_human: "Needs a person",
};

export const STATUS_HELP: Record<Status, string> = {
  ok: "Recorded against the invoice the customer meant, or nothing suggests otherwise.",
  misapplied: "Right account, wrong invoice.",
  wrong_account: "Meant for an invoice on a different account.",
  unapplied: "Money not applied to any invoice while the account has open invoices.",
  needs_human: "The data cannot settle it, or a person has to decide.",
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  hold_reminder: "Hold reminder",
  paid: "Paid",
  owed: "Still owed",
  void: "Void",
  needs_human: "Needs a person",
};

export function flagLabel(f: Flag): string {
  switch (f.kind) {
    case "over_applied":
      return "Applied more than received";
    case "void_target":
      return `Applied to void invoice ${f.invoice}`;
    case "future_invoice":
      return `Applied to ${f.invoice} before it was issued`;
    case "cross_account_application":
      return `Applied to ${f.invoice} on ${f.invoiceCustomerId}`;
    case "possible_duplicate":
      return `Possible duplicate of ${f.of}`;
    case "no_account":
      return "No account recorded";
    case "suspicious_memo":
      return "Memo tries to instruct the system";
  }
}

// A finding belongs in the review queue when the system is unsure about it.
export function needsReview(f: { status: Status; confidence: "high" | "low" }): boolean {
  return f.status === "needs_human" || f.confidence === "low";
}
