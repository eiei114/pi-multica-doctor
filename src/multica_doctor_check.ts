/**
 * pi-multica-doctor — Multica workspace health diagnostics
 *
 * Walking skeleton: returns a static JSON contract with all probes stubbed as pass.
 * Real probe logic is implemented in later build slices.
 */

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

function buildStaticProbeResults(): ProbeResult[] {
  return CHECK_NAMES.map((check) => ({ check, status: "pass" }));
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
 *
 * Scaffold stub: all probes report pass with an empty failures array.
 */
export function multicaDoctorCheck(): MulticaDoctorResult {
  const results = buildStaticProbeResults();
  const failures = toFailures(results);

  return {
    checks: [...CHECK_NAMES],
    pass: failures.length === 0,
    fail_count: failures.length,
    failures,
  };
}

/** Exposed for tests: each probe's `{ check, status }` semantics. */
export function getProbeResults(): readonly ProbeResult[] {
  return buildStaticProbeResults();
}
