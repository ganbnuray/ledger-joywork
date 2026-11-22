import { ledger } from "@/src/ledger/bundled";
import { ensureReady, exportLabels } from "@/src/db/findings";

export const dynamic = "force-dynamic";

// Downloads my labels as data/labels.json, ready to commit.
// Add ?view=1 to show the file in the browser instead of downloading it.
export async function GET(request: Request) {
  try {
    await ensureReady(ledger);
    const labels = await exportLabels();
    const view = new URL(request.url).searchParams.has("view");
    return new Response(JSON.stringify(labels, null, 2) + "\n", {
      headers: {
        "Content-Type": view ? "text/plain; charset=utf-8" : "application/json",
        ...(view ? {} : { "Content-Disposition": 'attachment; filename="labels.json"' }),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(`Could not export the labels: ${(error as Error).message}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
