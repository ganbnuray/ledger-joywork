import { cookies } from "next/headers";
import type { Ledger } from "../ledger/types";
import { listVersionNames } from "../db/findings";
import { MATCHER_VERSION } from "../matcher/versions";

export const VERSION_COOKIE = "system_version";

// The system version the person chose to look at. Falls back to the current one.
export async function viewedVersion(ledger: Ledger): Promise<{ version: string; isCurrent: boolean; all: string[] }> {
  const all = await listVersionNames(ledger);
  const chosen = (await cookies()).get(VERSION_COOKIE)?.value;
  const version = chosen && all.includes(chosen) ? chosen : MATCHER_VERSION;
  return { version, isCurrent: version === MATCHER_VERSION, all };
}
