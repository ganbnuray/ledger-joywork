import type { Status } from "../matcher/match";
import { STATUSES } from "../view/labels";

export type StatusScore = {
  status: Status;
  predicted: number; // payments the system gave this status (among the labeled ones)
  labeled: number; // payments I labeled with this status
  agreed: number; // both
  precision: number | null; // agreed / predicted, null when the system never predicted it
  recall: number | null; // agreed / labeled, null when I never used the label
};

export type Evaluation = {
  labeledCount: number;
  agreedCount: number;
  scores: StatusScore[];
  confusion: Record<Status, Record<Status, number>>; // confusion[label][predicted]
  disagreements: { paymentId: string; label: Status; predicted: Status }[];
};

// Compares the system's statuses with my labels. Only labeled payments count.
export function evaluate(predicted: Map<string, Status>, labels: Map<string, Status>): Evaluation {
  const confusion = Object.fromEntries(
    STATUSES.map((l) => [l, Object.fromEntries(STATUSES.map((p) => [p, 0]))]),
  ) as Evaluation["confusion"];
  const disagreements: Evaluation["disagreements"] = [];

  for (const [paymentId, label] of labels) {
    const p = predicted.get(paymentId);
    if (!p) continue;
    confusion[label][p] += 1;
    if (p !== label) disagreements.push({ paymentId, label, predicted: p });
  }

  const scores = STATUSES.map((s) => {
    const predictedCount = STATUSES.reduce((sum, l) => sum + confusion[l][s], 0);
    const labeledCount = STATUSES.reduce((sum, p) => sum + confusion[s][p], 0);
    const agreed = confusion[s][s];
    return {
      status: s,
      predicted: predictedCount,
      labeled: labeledCount,
      agreed,
      precision: predictedCount ? agreed / predictedCount : null,
      recall: labeledCount ? agreed / labeledCount : null,
    };
  });

  const labeledCount = STATUSES.reduce((sum, l) => sum + STATUSES.reduce((s2, p) => s2 + confusion[l][p], 0), 0);
  return {
    labeledCount,
    agreedCount: labeledCount - disagreements.length,
    scores,
    confusion,
    disagreements: disagreements.sort((a, b) => a.paymentId.localeCompare(b.paymentId)),
  };
}
