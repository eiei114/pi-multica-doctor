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
  check: CheckName | "multica_doctor_check";
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

export type DoctorProbe = () => ProbeResult;

export interface MulticaDoctorCheckOptions {
  authContext?: AuthContextDeps;
  feedbackJsonl?: FeedbackJsonlDeps;
  /** Optional per-check overrides, primarily for testing failure boundaries. */
  probeOverrides?: Partial<Record<CheckName, DoctorProbe>>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return typeof error === "string" ? error : "Unknown error";
}

function runProbe(check: CheckName, probe: DoctorProbe): ProbeResult {
  try {
    return probe();
  } catch (error) {
    return {
      check,
      status: "fail",
      detail: `${check} probe error: ${errorMessage(error)}`,
      hint: "Retry this check; inspect the relevant file and permissions if the error persists.",
    };
  }
}

function buildProbeResults(options: MulticaDoctorCheckOptions = {}): ProbeResult[] {
  return CHECK_NAMES.map((check) =>
    runProbe(check, () => {
      const override = options.probeOverrides?.[check];
      if (override) return override();
      if (check === "auth_context") {
        return checkAuthContext(options.authContext);
      }
      if (check === "feedback_jsonl") {
        return checkFeedbackJsonl(options.feedbackJsonl);
      }
      return { check, status: "pass" } as const;
    }),
  );
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

/**
 * Keep callers' JSON contract intact if constructing the result itself fails.
 * Individual probe errors are normally handled by `runProbe` above.
 */
export function runDoctorCheckSafely(
  buildResult: () => MulticaDoctorResult = multicaDoctorCheck,
): MulticaDoctorResult {
  try {
    return buildResult();
  } catch (error) {
    const message = errorMessage(error);
    return {
      checks: [...CHECK_NAMES],
      pass: false,
      fail_count: 1,
      failures: [
        {
          check: "multica_doctor_check",
          status: "fail",
          detail: `multica_doctor_check error: ${message}`,
          hint: "Retry the health check; inspect the runtime error if it persists.",
        },
      ],
    };
  }
}

/** Exposed for tests: each probe's `{ check, status }` semantics. */
export function getProbeResults(
  options: MulticaDoctorCheckOptions = {},
): readonly ProbeResult[] {
  return buildProbeResults(options);
}
