"use client";

import { useState } from "react";

// Shows the labels file as text with a copy button, for when a download does not work.
export function CopyLabels({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="sister" style={{ marginTop: 12 }}>
      <summary>
        <span>Show labels.json as text</span>
        <span className="muted">if the download does not work</span>
      </summary>
      <div className="sister-body">
        <p style={{ margin: "10px 0" }}>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy all"}
          </button>
        </p>
        <textarea readOnly value={text} style={{ width: "100%", height: 260, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }} />
      </div>
    </details>
  );
}
