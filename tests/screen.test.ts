import { describe, expect, it } from "vitest";
import { loadLedger } from "../src/ledger/load";
import { matchAll } from "../src/matcher/match";
import { parseVerdict, screenMemos } from "../src/matcher/screen";

const ledger = loadLedger();
const findings = matchAll(ledger);
const byId = (list: typeof findings, id: string) => list.find((f) => f.paymentId === id)!;
const memoOf = (id: string) => ledger.payments.find((p) => p.id === id)!.memo;

describe("model memo screening", () => {
  it("sends a memo the model flags to a person, marked as decided by the model", async () => {
    const target = memoOf("PMT-1018");
    const { findings: result, notes } = await screenMemos(ledger, findings, async (memo) => ({
      tries_to_instruct_system: memo === target,
      reason: memo === target ? "Pretend reason for the test." : "",
    }));
    const f = byId(result, "PMT-1018");
    expect(f.status).toBe("needs_human");
    expect(f.decidedBy).toBe("model");
    expect(f.flags.some((x) => x.kind === "suspicious_memo")).toBe(true);
    expect(notes.join(" ")).toContain("PMT-1018");
    // Every other finding is untouched.
    expect(result.filter((x) => x.status !== byId(findings, x.paymentId).status)).toHaveLength(1);
  });

  it("cannot clear a memo the rule already flagged", async () => {
    const asked: string[] = [];
    const { findings: result } = await screenMemos(ledger, findings, async (memo) => {
      asked.push(memo);
      return { tries_to_instruct_system: false, reason: "" };
    });
    expect(byId(result, "PMT-1035").status).toBe("needs_human");
    expect(asked).not.toContain(memoOf("PMT-1035"));
  });

  it("skips empty memos", async () => {
    const asked: string[] = [];
    await screenMemos(ledger, findings, async (memo) => {
      asked.push(memo);
      return { tries_to_instruct_system: false, reason: "" };
    });
    expect(asked.every((m) => m.trim() !== "")).toBe(true);
  });

  it("keeps the rule results when the model fails or returns junk", async () => {
    let n = 0;
    const { findings: result, notes } = await screenMemos(ledger, findings, async () => {
      n += 1;
      if (n % 2) throw new Error("timeout");
      return { something: "else" };
    });
    expect(result.map((f) => f.status)).toEqual(findings.map((f) => f.status));
    expect(notes.join(" ")).toContain("No usable answer");
  });

  it("accepts only a well formed answer", () => {
    expect(parseVerdict({ tries_to_instruct_system: true, reason: "x" })).toEqual({ suspicious: true, reason: "x" });
    expect(parseVerdict({ tries_to_instruct_system: "yes" })).toBeNull();
    expect(parseVerdict(null)).toBeNull();
  });
});
