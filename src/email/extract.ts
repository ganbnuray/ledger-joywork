import type { Ledger } from "../ledger/types";
import { toCents } from "../ledger/load";

// What a customer email claims, in a fixed shape.
// Both the rules and the model fill this shape, so the checker never sees raw text.
// The email is customer text: it is evidence of what they believe, never an instruction.
export type EmailClaims = {
  senderEmail: string | null;
  accountName: string | null; // the "Account:" line, if any
  invoiceRefs: string[]; // NB-xxxx numbers that exist in the ledger
  unknownRefs: string[]; // NB-xxxx numbers that do not exist
  paymentRefs: string[]; // normalized, e.g. "ACH 7781", "EFT 3415", "CHECK 10518"
  dates: string[]; // "YYYY-MM-DD"
  amounts: number[]; // cents
  periods: string[]; // billing months mentioned, "YYYY-MM"
  paidThrough: string | null; // "paid everything through October" gives "2026-10"
  mentionsCredit: boolean;
  suspicious: boolean;
};

const MONTH_NAMES: [string, string][] = [
  ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"], ["may", "05"], ["jun", "06"],
  ["jul", "07"], ["aug", "08"], ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"],
];

// Matches "Sep", "Sept", "September" and so on, but not "mayor" or "marching".
const MONTH_WORD =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function monthNumber(word: string): string {
  return MONTH_NAMES.find(([prefix]) => word.toLowerCase().startsWith(prefix))![1];
}

const SUSPICIOUS =
  /\bignore\b.*\b(previous|prior|above|instructions?)\b|\bAI\b|system prompt|you are (an?|the) |mark .* as paid|report no findings|disregard (all|any|previous|prior|your)/i;

export function extractPaymentRefs(text: string): string[] {
  const refs = new Set<string>();
  const re = /\b(ACH|EFT|WIRE|CHECK|CHEQUE|CHK|CM)\b[\s#:.-]*(?:(?:ref(?:erence)?|confirmation|trace|number|no)\.?\s*#?\s*)?([0-9][0-9-]*)/gi;
  for (const m of text.matchAll(re)) {
    let method = m[1].toUpperCase();
    if (method === "CHEQUE" || method === "CHK") method = "CHECK";
    refs.add(method === "CM" ? `CM-${m[2].replace(/^-/, "")}` : `${method} ${m[2]}`);
  }
  return [...refs];
}

export function extractDates(text: string, year: string): string[] {
  const dates = new Set<string>();
  // "September 1", "Oct 3", "Oct. 3rd, 2026"
  const named = new RegExp(`\\b${MONTH_WORD}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(20\\d\\d))?`, "gi");
  for (const m of text.matchAll(named)) {
    const day = Number(m[2]);
    if (day >= 1 && day <= 31) dates.add(`${m[3] ?? year}-${monthNumber(m[1])}-${String(day).padStart(2, "0")}`);
  }
  // "2026-09-01"
  for (const m of text.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)) dates.add(`${m[1]}-${m[2]}-${m[3]}`);
  // "9/1" or "9/1/2026", read as US month/day
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d\d|\d\d))?\b/g)) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : year;
    dates.add(`${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return [...dates];
}

export function extractAmounts(text: string): number[] {
  const amounts = new Set<number>();
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g)) {
    amounts.add(toCents(Number(m[1].replace(/,/g, ""))));
  }
  return [...amounts];
}

// Months mentioned anywhere, plus the month in "through October".
export function extractPeriods(text: string, year: string): { periods: string[]; paidThrough: string | null } {
  const periods = new Set<string>();
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_WORD}\\b`, "gi"))) {
    // "September 1" is a date, not a billing month.
    if (/^\.?\s+\d{1,2}\b/.test(text.slice(m.index! + m[0].length))) continue;
    // "may" is a common verb. Only count it next to a billing word or a number.
    if (/^may$/i.test(m[1]) && !/\bmay\s+(\d|invoice|bill|service|payment)/i.test(text.slice(m.index!, m.index! + 20))) continue;
    periods.add(`${year}-${monthNumber(m[1])}`);
  }
  const through = text.match(new RegExp(`\\b(?:through|thru|up to|until)\\s+(?:the\\s+end\\s+of\\s+)?${MONTH_WORD}\\b`, "i"));
  return { periods: [...periods], paidThrough: through ? `${year}-${monthNumber(through[1])}` : null };
}

export function extractClaims(text: string, ledger: Ledger): EmailClaims {
  const year = ledger.asOf.slice(0, 4);
  const sender = text.match(/^\s*from:\s*.*?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/im);
  const account = text.match(/^\s*account:\s*(.+)$/im);
  const found = [...new Set(text.toUpperCase().match(/NB-\d{4}/g) ?? [])];
  const { periods, paidThrough } = extractPeriods(text, year);

  return {
    senderEmail: sender ? sender[1].toLowerCase() : null,
    accountName: account ? account[1].trim() : null,
    invoiceRefs: found.filter((n) => ledger.invoiceByNumber.has(n)),
    unknownRefs: found.filter((n) => !ledger.invoiceByNumber.has(n)),
    paymentRefs: extractPaymentRefs(text),
    dates: extractDates(text, year),
    amounts: extractAmounts(text),
    periods,
    paidThrough,
    mentionsCredit: /\bcredit(ed)?\b|credit memo|\bCM-\d/i.test(text),
    suspicious: SUSPICIOUS.test(text),
  };
}
