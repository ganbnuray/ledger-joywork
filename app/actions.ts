"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ledger } from "@/src/ledger/bundled";
import { addReview, listFindings } from "@/src/db/findings";
import type { Status } from "@/src/matcher/match";
import { readEmail, type ReadResult } from "@/src/email/model";
import { checkEmail, type EmailCheck } from "@/src/email/check";
import { STATUSES } from "@/src/view/labels";
import { reviewQueue } from "@/src/view/filter";

export async function reviewFinding(formData: FormData) {
  const paymentId = String(formData.get("paymentId"));
  const action = formData.get("action") === "correct" ? "correct" : "confirm";
  const systemStatus = String(formData.get("systemStatus")) as Status;
  const chosen = String(formData.get("status")) as Status;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const from = formData.get("from");
  // Only a plain query string is accepted, so the redirect stays on this site.
  const rawQuery = String(formData.get("query") ?? "");
  const query = from === "review" ? "?from=review" : /^\?[\w=&%+.-]*$/.test(rawQuery) ? rawQuery : "";

  const status = action === "confirm" ? systemStatus : chosen;
  if (!STATUSES.includes(status)) throw new Error("Unknown status");

  // Where the person says the money belongs. Both must exist in the ledger.
  const invoices = [...new Set(String(formData.get("invoices") ?? "").toUpperCase().match(/NB-\d{4}/g) ?? [])];
  const unknown = invoices.filter((n) => !ledger.invoiceByNumber.has(n));
  const customerId = String(formData.get("customerId") ?? "") || null;
  const badAccount = customerId !== null && !ledger.customerById.has(customerId);
  if (unknown.length > 0 || badAccount) {
    const message = unknown.length > 0 ? `Not in the ledger: ${unknown.join(", ")}` : "Unknown account";
    const sep = query ? "&" : "?";
    redirect(`/findings/${paymentId}${query}${sep}error=${encodeURIComponent(message)}#review`);
  }

  await addReview(paymentId, action, status, note, invoices, customerId);
  revalidatePath("/", "layout");

  // From the review queue, move on to the next finding that still needs a look.
  if (from === "review") {
    const next = reviewQueue(await listFindings(ledger)).find((f) => f.reviews.length === 0);
    redirect(next ? `/findings/${next.paymentId}?from=review` : "/review");
  }
  redirect(`/findings/${paymentId}${query}`);
}

export type EmailState = { text: string; read: ReadResult; result: EmailCheck } | null;

export async function checkEmailAction(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const text = String(formData.get("email") ?? "").slice(0, 20_000);
  if (text.trim() === "") return null;
  const read = await readEmail(text, ledger);
  // The email check uses the system's stored findings (rules plus the model's memo check),
  // not the review history, so its answer always traces back to the ledger.
  const result = checkEmail(read.claims, ledger, await listFindings(ledger));
  return { text, read, result };
}
