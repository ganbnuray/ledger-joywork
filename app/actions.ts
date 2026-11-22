"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ledger } from "@/src/ledger/bundled";
import { addReview, listFindings } from "@/src/db/findings";
import { matchAll, type Status } from "@/src/matcher/match";
import { readEmail, type ReadResult } from "@/src/email/model";
import { checkEmail, type EmailCheck } from "@/src/email/check";
import { STATUSES, needsReview } from "@/src/view/labels";

export async function reviewFinding(formData: FormData) {
  const paymentId = String(formData.get("paymentId"));
  const action = formData.get("action") === "correct" ? "correct" : "confirm";
  const systemStatus = String(formData.get("systemStatus")) as Status;
  const chosen = String(formData.get("status")) as Status;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const from = formData.get("from");

  const status = action === "confirm" ? systemStatus : chosen;
  if (!STATUSES.includes(status)) throw new Error("Unknown status");

  await addReview(paymentId, action, status, note);
  revalidatePath("/", "layout");

  // From the review queue, move on to the next finding that still needs a look.
  if (from === "review") {
    const next = (await listFindings(ledger)).find((f) => needsReview(f) && f.reviews.length === 0);
    redirect(next ? `/findings/${next.paymentId}?from=review` : "/review");
  }
  redirect(`/findings/${paymentId}`);
}

export type EmailState = { text: string; read: ReadResult; result: EmailCheck } | null;

export async function checkEmailAction(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const text = String(formData.get("email") ?? "").slice(0, 20_000);
  if (text.trim() === "") return null;
  const read = await readEmail(text, ledger);
  // The email check uses the matcher's own findings, not the review history,
  // so its answer always traces back to the ledger.
  const result = checkEmail(read.claims, ledger, matchAll(ledger));
  return { text, read, result };
}
