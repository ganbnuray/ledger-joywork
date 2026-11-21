import type { Ledger } from "../ledger/types";

// What we can read out of a payment memo with plain code.
// The memo is customer text: it is evidence of intent, never an instruction.
export type MemoSignals = {
  invoiceRefs: string[]; // invoice numbers that exist in the ledger
  unknownRefs: string[]; // NB-xxxx numbers that do not exist
  periods: string[]; // billing months mentioned, as "YYYY-MM"
  locationAccountIds: string[]; // accounts whose location name appears in the memo
  mentionsDiscount: boolean;
  suspicious: boolean; // text that looks aimed at an automated system
};

const MONTHS: [RegExp, string][] = [
  [/\bjan(uary)?\b/i, "01"],
  [/\bfeb(ruary)?\b/i, "02"],
  [/\bmar(ch)?\b/i, "03"],
  [/\bapr(il)?\b/i, "04"],
  [/\bmay\b/i, "05"],
  [/\bjune?\b/i, "06"],
  [/\bjuly?\b/i, "07"],
  [/\baug(ust)?\b/i, "08"],
  [/\bsep(t|tember)?\b/i, "09"],
  [/\boct(ober)?\b/i, "10"],
  [/\bnov(ember)?\b/i, "11"],
  [/\bdec(ember)?\b/i, "12"],
];

const DISCOUNT = /discount|deduct|less \$|short ?pa(y|id)|dispute|withh[eo]ld/i;

const SUSPICIOUS = /\bignore\b.*\b(previous|prior|above|instructions?)\b|\bAI\b|reconciler|system prompt|report no findings|mark .* as paid/i;

export function parseMemo(memo: string, ledger: Ledger, year = ledger.asOf.slice(0, 4)): MemoSignals {
  const found = [...new Set(memo.toUpperCase().match(/NB-\d{4}/g) ?? [])];
  const invoiceRefs = found.filter((n) => ledger.invoiceByNumber.has(n));
  const unknownRefs = found.filter((n) => !ledger.invoiceByNumber.has(n));

  const periods = MONTHS.filter(([re]) => re.test(memo)).map(([, mm]) => `${year}-${mm}`);

  // A location is the part of an account name after " - ", e.g. "Eastgate" or "Airport".
  const lower = memo.toLowerCase();
  const locationAccountIds = ledger.customers
    .filter((c) => {
      const location = c.name.split(" - ")[1];
      return location !== undefined && lower.includes(location.toLowerCase());
    })
    .map((c) => c.id);

  return {
    invoiceRefs,
    unknownRefs,
    periods,
    locationAccountIds,
    mentionsDiscount: DISCOUNT.test(memo),
    suspicious: SUSPICIOUS.test(memo),
  };
}
