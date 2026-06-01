"use client";

import { useState } from "react";
import { AiLogEntry } from "@/lib/types";

interface Props {
  entries: AiLogEntry[];
}

export default function AiLogPanel({ entries }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="log-section">
      <button
        className="log-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 8h10M7 12h6M7 16h4" />
        </svg>
        {open ? "Hide" : "Show"} AI interaction log ({entries.length} events)
      </button>

      {open && (
        <div className="log-panel" role="log" aria-label="AI governance log">
          {entries.map((e, i) => (
            <div key={i} className="log-entry">
              <span className="log-ts">{e.timestamp}</span>
              <span className="log-type">[{e.type}]</span>
              <pre className="log-content">
                {typeof e.content === "string"
                  ? e.content
                  : JSON.stringify(e.content, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
