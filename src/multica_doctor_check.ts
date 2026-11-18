/**
 * pi-multica-doctor — Multica workspace health diagnostics
 *
 * Walking skeleton: returns a static JSON contract. auth_context and
 * feedback_jsonl are real probes; the other three are stubbed as pass.
 */

import {
  checkAuthContext,
  type AuthContextDeps,
} from "./probes/auth_context.ts";
import {
  checkFeedbackJsonl,
  type FeedbackJsonlDeps,
} from "./probes/feedback_jsonl.ts";

export const CHECK_NAMES = [
  "auth_context",
  "cli_syntax",
  "registry_tables",
  "feedback_jsonl",
  "stuck_runs",
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];
export type CheckStatus = "pass" | "fail";

export interface ProbeResult {
  check: CheckName;
  status: CheckStatus;
  detail?: string;
  hint?: string;
}

export interface CheckFailure {
  check: CheckName;
  status: CheckStatus;
  detail: string;
  hint: string;
}

export interface MulticaDoctorResult {
  checks: readonly CheckName[];
  pass: boolean;
  fail_count: number;
  failures: CheckFailure[];
}

export interface MulticaDoctorCheckOptions {
  authContext?: AuthContextDeps;
  feedbackJsonl?: FeedbackJsonlDeps;
}

function buildStaticProbeResults(): ProbeResult[] {
  return CHECK_NAMES.filter(
    (check) => check !== "auth_context" && check !== "feedback_jsonl",
  ).map((check) => ({ check, status: "pass" }));
}

function buildProbeResults(options: MulticaDoctorCheckOptions = {}): ProbeResult[] {
  return CHECK_NAMES.map((check) => {
    if (check === "auth_context") {
      return checkAuthContext(options.authContext);
    }
    if (check === "feedback_jsonl") {
      return checkFeedbackJsonl(options.feedbackJsonl);
    }
    return { check, status: "pass" } as const;
  });
}

function toFailures(results: readonly ProbeResult[]): CheckFailure[] {
  return results
    .filter((result) => result.status === "fail")
    .map((result) => ({
      check: result.check,
      status: result.status,
      detail: result.detail ?? "",
      hint: result.hint ?? "",
    }));
}

/**
 * Run Multica workspace health checks.
 */
export function multicaDoctorCheck(
  options: MulticaDoctorCheckOptions = {},
): MulticaDoctorResult {
  const results = buildProbeResults(options);
  const failures = toFailures(results);

  return {
    checks: [...CHECK_NAMES],
    pass: failures.length === 0,
    fail_count: failures.length,
    failures,
  };
}

/** Exposed for tests: each probe's `{ check, status }` semantics. */
export function getProbeResults(
  options: MulticaDoctorCheckOptions = {},
): readonly ProbeResult[] {
  return buildProbeResults(options);
}
