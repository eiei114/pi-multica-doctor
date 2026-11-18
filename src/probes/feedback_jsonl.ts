import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { ProbeResult } from "../multica_doctor_check.ts";

export const FEEDBACK_EVENTS_RELATIVE = join(
  "4_Project",
  "Multica-Agent-Strategy",
  "Data",
  "feedback-events",
);

/** Maximum number of `<file>:<line>` entries kept in the failure detail. */
export const MAX_REPORTED_LINES = 5;
/** Maximum number of characters copied from a corrupt line into the hint. */
export const MAX_EXCERPT_CHARS = 40;

export interface FeedbackJsonlDeps {
  cwd: () => string;
  /** Directory discovery: return absolute paths of the .jsonl files to check. */
  discoverJsonlFiles: (root: string) => string[];
  readText: (path: string, encoding: BufferEncoding) => string;
}

const defaultDeps = (): FeedbackJsonlDeps => ({
  cwd: () => process.cwd(),
  discoverJsonlFiles: (root) => {
    const vaultRoot = process.env.OBSIDIAN_VAULT_ROOT ?? root;
    const eventsDir = join(vaultRoot, FEEDBACK_EVENTS_RELATIVE);
    if (!existsSync(eventsDir)) {
      throw new Error(
        `feedback-events directory not found (${FEEDBACK_EVENTS_RELATIVE})`,
      );
    }
    return readdirSync(eventsDir)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => join(eventsDir, name));
  },
  readText: (path, encoding) => readFileSync(path, encoding),
});

export interface InvalidJsonlLine {
  filename: string;
  line: number;
  excerpt: string;
}

/**
 * Find non-empty lines that fail JSON.parse. Each line is parsed on its own, so a
 * pretty-printed JSON object spread across several lines is reported as invalid
 * (the "merge line" case). Read-only: nothing is repaired or rewritten.
 */
export function findInvalidJsonlLines(
  filename: string,
  content: string,
): InvalidJsonlLine[] {
  const invalid: InvalidJsonlLine[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      JSON.parse(line);
    } catch {
      invalid.push({
        filename,
        line: i + 1,
        excerpt:
          line.length > MAX_EXCERPT_CHARS
            ? `${line.slice(0, MAX_EXCERPT_CHARS)}…`
            : line,
      });
    }
  }

  return invalid;
}

/**
 * Validate feedback-events/*.jsonl line-by-line with the Node stdlib only.
 *
 * Every failure stays a check-level result: a missing or unreadable directory,
 * or an unreadable file, is reported as `fail` rather than thrown. Failure detail
 * is bounded to a short `<file>:<line>` list plus "and N more", and the hint
 * carries at most one short truncated excerpt of a bad line.
 */
export function checkFeedbackJsonl(
  deps: FeedbackJsonlDeps = defaultDeps(),
): ProbeResult {
  let files: string[];
  try {
    files = deps.discoverJsonlFiles(deps.cwd());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      check: "feedback_jsonl",
      status: "fail",
      detail: `feedback_jsonl probe error: ${message}`,
      hint: "Ensure OBSIDIAN_VAULT_ROOT or cwd points at the vault and feedback-events is readable",
    };
  }

  const invalid: InvalidJsonlLine[] = [];
  for (const filePath of files) {
    let content: string;
    try {
      content = deps.readText(filePath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const filename = basename(filePath);
      return {
        check: "feedback_jsonl",
        status: "fail",
        detail: `feedback_jsonl probe error: failed to read ${filename}: ${message}`,
        hint: `Fix file access for feedback-events/${filename}`,
      };
    }
    invalid.push(...findInvalidJsonlLines(basename(filePath), content));
  }

  if (invalid.length === 0) {
    return {
      check: "feedback_jsonl",
      status: "pass",
      detail:
        files.length === 0
          ? "feedback-events directory present with no .jsonl files"
          : `All ${files.length} feedback-events JSONL file(s) have valid JSON lines`,
    };
  }

  const reported = invalid.slice(0, MAX_REPORTED_LINES);
  const entries = reported.map((item) => `${item.filename}:${item.line}`);
  const hidden = invalid.length - reported.length;
  if (hidden > 0) entries.push(`and ${hidden} more`);

  return {
    check: "feedback_jsonl",
    status: "fail",
    detail: `${invalid.length} invalid JSON line(s): ${entries.join("; ")}`,
    hint: `Merge each event onto one line and reformat pretty-printed JSON; bad line excerpt: ${reported[0].excerpt}`,
  };
}
