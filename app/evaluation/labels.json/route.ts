import { exportLabels } from "@/src/db/findings";

export const dynamic = "force-dynamic";

// Downloads my labels as data/labels.json, ready to commit.
export async function GET() {
  const labels = await exportLabels();
  return new Response(JSON.stringify(labels, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="labels.json"',
    },
  });
}
