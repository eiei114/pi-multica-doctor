import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ProbeResult } from "../multica_doctor_check.ts";

export const FEEDBACK_EVENTS_RELATIVE = join(
  "4_Project",
  "Multica-Agent-Strategy",
  "Data",
  "feedback-events",
);

export interface FeedbackJsonlDeps {
  cwd: () => string;
  getVaultRoot: () => string | undefined;
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: BufferEncoding) => string;
}

export interface FileInvalidLineCount {
  filename: string;
  invalidLineCount: number;
}

const defaultDeps = (): FeedbackJsonlDeps => ({
  cwd: () => process.cwd(),
  getVaultRoot: () => process.env.OBSIDIAN_VAULT_ROOT,
  existsSync,
  readdirSync: (path) => readdirSync(path),
  readFileSync: (path, encoding) => readFileSync(path, encoding),
});

/**
 * Count non-empty lines that fail JSON.parse (read-only, stdlib only).
 */
export function countInvalidJsonlLines(content: string): number {
  let invalidLineCount = 0;

  for (const original of content.split(/\r?\n/)) {
    const line = original.trim();
    if (!line) {
      continue;
    }

    try {
      JSON.parse(line);
    } catch {
      invalidLineCount += 1;
    }
  }

  return invalidLineCount;
}

/**
 * Validate each JSONL file and return files with invalid line counts.
 */
export function validateFeedbackJsonlFiles(
  files: readonly { filename: string; content: string }[],
): FileInvalidLineCount[] {
  const problems: FileInvalidLineCount[] = [];

  for (const file of files) {
    const invalidLineCount = countInvalidJsonlLines(file.content);
    if (invalidLineCount > 0) {
      problems.push({ filename: file.filename, invalidLineCount });
    }
  }

  return problems;
}

export function resolveFeedbackEventsDir(deps: FeedbackJsonlDeps): string {
  const vaultRoot = deps.getVaultRoot() ?? deps.cwd();
  return join(vaultRoot, FEEDBACK_EVENTS_RELATIVE);
}

function listJsonlFilenames(deps: FeedbackJsonlDeps, directory: string): string[] {
  return deps
    .readdirSync(directory)
    .filter((name) => name.endsWith(".jsonl"))
    .sort();
}

/**
 * Validate feedback-events/*.jsonl line-by-line JSON (read-only, stdlib only).
 */
export function checkFeedbackJsonl(
  deps: FeedbackJsonlDeps = defaultDeps(),
): ProbeResult {
  try {
    const eventsDir = resolveFeedbackEventsDir(deps);

    if (!deps.existsSync(eventsDir)) {
      return {
        check: "feedback_jsonl",
        status: "fail",
        detail: `feedback-events directory not found (${FEEDBACK_EVENTS_RELATIVE})`,
        hint: "Ensure OBSIDIAN_VAULT_ROOT or cwd points at the Obsidian vault root",
      };
    }

    const filenames = listJsonlFilenames(deps, eventsDir);
    const files: { filename: string; content: string }[] = [];

    for (const filename of filenames) {
      const filePath = join(eventsDir, filename);
      try {
        files.push({
          filename,
          content: deps.readFileSync(filePath, "utf8"),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          check: "feedback_jsonl",
          status: "fail",
          detail: `failed to read ${filename}: ${message}`,
          hint: `Fix file access issues for feedback-events/${filename}`,
        };
      }
    }

    const problems = validateFeedbackJsonlFiles(files);

    if (problems.length === 0) {
      return {
        check: "feedback_jsonl",
        status: "pass",
        detail:
          filenames.length === 0
            ? "feedback-events directory present with no .jsonl files"
            : `All ${filenames.length} feedback-events JSONL file(s) have valid JSON lines`,
      };
    }

    const totalInvalid = problems.reduce(
      (sum, problem) => sum + problem.invalidLineCount,
      0,
    );
    const perFileDetail = problems
      .map(
        (problem) =>
          `${problem.filename}: ${problem.invalidLineCount} invalid line(s)`,
      )
      .join("; ");

    return {
      check: "feedback_jsonl",
      status: "fail",
      detail: `${totalInvalid} total invalid line(s): ${perFileDetail}`,
      hint: problems
        .map((problem) => `Fix malformed JSON lines in ${problem.filename}`)
        .join("; "),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      check: "feedback_jsonl",
      status: "fail",
      detail: `feedback_jsonl probe error: ${message}`,
      hint: "Fix feedback-events readability issues and retry",
    };
  }
}
