import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECK_NAMES,
  getProbeResults,
  multicaDoctorCheck,
} from "../src/multica_doctor_check.ts";

test("multicaDoctorCheck returns the expected JSON contract shape", () => {
  const result = multicaDoctorCheck();

  assert.deepEqual(result.checks, [...CHECK_NAMES]);
  assert.equal(result.pass, true);
  assert.equal(result.fail_count, 0);
  assert.deepEqual(result.failures, []);
});

test("multicaDoctorCheck lists all five probes", () => {
  const result = multicaDoctorCheck();

  assert.equal(result.checks.length, 5);
  assert.deepEqual(result.checks, [
    "auth_context",
    "cli_syntax",
    "registry_tables",
    "feedback_jsonl",
    "stuck_runs",
  ]);
});

test("each probe reports status pass in the static skeleton", () => {
  const results = getProbeResults();

  assert.equal(results.length, 5);
  for (const probe of results) {
    assert.equal(probe.status, "pass");
    assert.ok(CHECK_NAMES.includes(probe.check));
  }
});

test("multicaDoctorCheck never throws", () => {
  assert.doesNotThrow(() => multicaDoctorCheck());
});
