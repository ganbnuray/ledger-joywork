// Every version of the system that produced findings, oldest first.
// Add a new entry (and keep the old ones) whenever a rule or a model prompt changes.
// The app then stores the new findings next to the old ones, so both can be compared.
export const VERSIONS = [
  {
    version: "1",
    note: "Rules only. A memo aimed at the system is flagged and ignored as evidence, but the status still comes from the numbers (PMT-1035 is unapplied).",
  },
  {
    version: "2",
    note: "A memo aimed at the system sends the payment to a person. The model also checks every memo for injection attempts.",
  },
] as const;

export const MATCHER_VERSION: string = VERSIONS[VERSIONS.length - 1].version;

export function versionNote(version: string): string {
  return VERSIONS.find((v) => v.version === version)?.note ?? "No description recorded for this version.";
}
