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
  const latest = finding.reviews[0];
  if (!latest) return <StatusBadge status={finding.status} />;
  // The person reviewed an older answer of the system. Show the new answer, and that the review is older.
  if (latest.systemStatus !== finding.status) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <StatusBadge status={finding.status} />
        <span className="tag" title="Reviewed when the system gave a different answer">
          Older review: {STATUS_LABEL[latest.reviewedStatus]}
        </span>
      </span>
    );
  }
  const reviewed = latest.reviewedStatus;
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
