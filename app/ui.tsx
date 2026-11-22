import type { Status } from "@/src/matcher/match";
import type { StoredFinding } from "@/src/db/findings";
import { STATUS_LABEL } from "@/src/view/labels";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge s-${status}`}>
      <span className={`dot d-${status}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

// Shows the system's status, and the person's status next to it when they differ.
export function FindingStatus({ finding }: { finding: StoredFinding }) {
  const reviewed = finding.reviewedStatus;
  if (!reviewed) return <StatusBadge status={finding.status} />;
  if (reviewed === finding.status) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <StatusBadge status={reviewed} />
        <span className="tag">Confirmed</span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <StatusBadge status={reviewed} />
      <span className="tag" title={`The system said ${STATUS_LABEL[finding.status]}`}>
        Corrected from {STATUS_LABEL[finding.status]}
      </span>
    </span>
  );
}
