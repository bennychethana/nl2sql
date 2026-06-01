import { AiLogEntry } from "./types";

/**
 * GOVERNANCE LOGGER
 *
 * Every input sent to and output received from the AI model is logged here.
 * In production this would write to a persistent store (e.g. Postgres, S3,
 * or a dedicated audit service). For this POC we write to stdout/stderr so
 * the log is visible in the Next.js server console and easily replaceable
 * with a real sink.
 *
 * Required enterprise B2B fields per entry:
 *   - timestamp (ISO 8601)
 *   - type      (event classification)
 *   - content   (full payload — inputs AND outputs)
 *
 * To wire up a real store, replace the console.log calls with your
 * preferred persistence call (e.g. prisma.aiLog.create, supabase.from(...)).
 */

// In-memory log for this request context (useful for passing back to the UI)
export const sessionLog: AiLogEntry[] = [];

export function logAiEvent(
  type: AiLogEntry["type"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
): AiLogEntry {
  const entry: AiLogEntry = {
    timestamp: new Date().toISOString(),
    type,
    content,
  };

  // ── Production hook ───────────────────────────────────────────────────────
  // Replace these console calls with your audit DB write:
  //   await db.aiLog.create({ data: entry });
  // ─────────────────────────────────────────────────────────────────────────
  console.log("[AI_GOVERNANCE_LOG]", JSON.stringify(entry));

  sessionLog.push(entry);
  return entry;
}
