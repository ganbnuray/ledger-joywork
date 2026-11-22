import { describe, expect, it } from "vitest";
import { evaluate } from "../src/eval/metrics";
import type { Status } from "../src/matcher/match";

const m = (entries: [string, Status][]) => new Map(entries);

describe("precision and recall", () => {
  it("counts agreement per status", () => {
    const predicted = m([["A", "ok"], ["B", "ok"], ["C", "misapplied"], ["D", "unapplied"]]);
    const labels = m([["A", "ok"], ["B", "misapplied"], ["C", "misapplied"], ["D", "needs_human"]]);
    const e = evaluate(predicted, labels);
    const score = (s: Status) => e.scores.find((x) => x.status === s)!;

    expect(e.labeledCount).toBe(4);
    expect(e.agreedCount).toBe(2);
    expect(score("ok").precision).toBe(0.5); // said ok twice, right once
    expect(score("ok").recall).toBe(1); // labeled ok once, caught
    expect(score("misapplied").precision).toBe(1);
    expect(score("misapplied").recall).toBe(0.5);
    expect(score("needs_human").recall).toBe(0);
    expect(score("needs_human").precision).toBeNull(); // never predicted
    expect(score("wrong_account").recall).toBeNull(); // never labeled
    expect(e.confusion.needs_human.unapplied).toBe(1);
    expect(e.disagreements.map((d) => d.paymentId)).toEqual(["B", "D"]);
  });

  it("ignores payments without a label", () => {
    const e = evaluate(m([["A", "ok"], ["B", "ok"]]), m([["A", "ok"]]));
    expect(e.labeledCount).toBe(1);
    expect(e.scores.find((s) => s.status === "ok")!.precision).toBe(1);
  });
});
