"use client";

import { useRef } from "react";
import { setViewedVersion } from "./actions";

// A small select in the top bar. Picking a version reloads the page as that version gave it.
export function VersionSwitcher({ versions, current, viewed }: { versions: string[]; current: string; viewed: string }) {
  const form = useRef<HTMLFormElement>(null);
  if (versions.length < 2) return null;
  return (
    <form ref={form} action={setViewedVersion} className="version-switch">
      <label>
        Version
        <select name="version" defaultValue={viewed} onChange={() => form.current?.requestSubmit()}>
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
              {v === current ? " (current)" : ""}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit">Show</button>
      </noscript>
    </form>
  );
}
