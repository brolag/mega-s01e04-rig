export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // Owner from the last valid event for this job, including an explicit null.
  owner: string | null;
  // All valid events for this job, including retry and fail events.
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  // Most recent supplied error string; null if none. Recovery does not clear it.
  lastError: string | null;
  // First/last valid events in file order, not sorted by timestamp. Keep offsets.
  firstAt: string;
  lastAt: string;
  // Remains true after recovery so the page can mark any job that failed.
  hasFail: boolean;
};

// Counts of valid events across the night, not counts of jobs or final statuses.
export type DigestCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type NightDigest = {
  night: string;
  // One row per exact job name, ascending by JS string comparison (< / >).
  rows: DigestRow[];
  badLines: number;
  counts: DigestCounts;
};

/**
 * Contract for the synchronous readNight(runsDir, night) implementation.
 * Read only runsDir/<night>.jsonl. Return null for a night not matching
 * YYYY-MM-DD or a missing file (ENOENT); propagate other filesystem errors.
 * An empty file returns a digest with no rows, no bad lines and zero counts.
 *
 * Ignore blank/whitespace-only lines. Count each other line once in badLines
 * when JSON parsing or event validation fails, and continue with later lines.
 * A valid event is an object with a nonempty string job, an ISO 8601 date-time
 * at with an explicit Z or numeric offset, status ok/retry/fail, a string or
 * null owner, and an optional string error. The timestamp must be parseable;
 * preserve its original text. Ignore extra properties. Invalid events affect
 * neither rows nor counts.
 *
 * Fold valid events in file order: firstAt is the first event's at; lastAt,
 * owner and lastStatus come from the last event. lastError retains the latest
 * supplied error string. runs counts all events, retries counts retry events,
 * and hasFail records whether any event failed. Sort the resulting rows by job.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
