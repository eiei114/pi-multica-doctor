import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  CHECK_NAMES,
  getProbeResults,
  multicaDoctorCheck,
} from "../src/multica_doctor_check.ts";
import {
  checkAuthContext,
  DAEMON_TASK_CONTEXT_RELATIVE,
} from "../src/probes/auth_context.ts";

const healthyAuthContext = {
  cwd: () => "/workspace",
  existsSync: () => false,
  getToken: () => "test-token",
};

test("multicaDoctorCheck returns the expected JSON contract shape", () => {
  const result = multicaDoctorCheck({ authContext: healthyAuthContext });

  assert.deepEqual(result.checks, [...CHECK_NAMES]);
  assert.equal(result.pass, true);
  assert.equal(result.fail_count, 0);
  assert.deepEqual(result.failures, []);
});

test("multicaDoctorCheck lists all five probes", () => {
  const result = multicaDoctorCheck({ authContext: healthyAuthContext });

  assert.equal(result.checks.length, 5);
  assert.deepEqual(result.checks, [
    "auth_context",
    "cli_syntax",
    "registry_tables",
    "feedback_jsonl",
    "stuck_runs",
  ]);
});

test("non-auth probes remain stubbed as pass", () => {
  const results = getProbeResults({ authContext: healthyAuthContext });

  assert.equal(results.length, 5);
  for (const probe of results) {
    assert.ok(CHECK_NAMES.includes(probe.check));
    if (probe.check !== "auth_context") {
      assert.equal(probe.status, "pass");
    }
  }
});

test("multicaDoctorCheck never throws", () => {
  assert.doesNotThrow(() => multicaDoctorCheck({ authContext: healthyAuthContext }));
});

test("auth_context passes when daemon marker is absent and token is present", () => {
  const result = checkAuthContext(healthyAuthContext);

  assert.equal(result.status, "pass");
  assert.match(result.detail ?? "", /daemon_task_context\.json: absent/);
  assert.match(result.detail ?? "", /MULTICA_TOKEN: present/);
});

test("auth_context fails when stale daemon marker exists", () => {
  const result = checkAuthContext({
    cwd: () => "/workspace",
    existsSync: (path) =>
      path === join("/workspace", DAEMON_TASK_CONTEXT_RELATIVE),
    getToken: () => "test-token",
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /daemon_task_context\.json: present/);
  assert.equal(result.hint, "Rename/remove stale context file");
});

test("auth_context fails when MULTICA_TOKEN is absent", () => {
  const result = checkAuthContext({
    cwd: () => "/workspace",
    existsSync: () => false,
    getToken: () => undefined,
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /MULTICA_TOKEN: absent/);
  assert.equal(result.hint, "Set MULTICA_TOKEN environment variable");
});

test("auth_context reports both failures when marker and token are unhealthy", () => {
  const result = checkAuthContext({
    cwd: () => "/workspace",
    existsSync: () => true,
    getToken: () => "",
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /daemon_task_context\.json: present/);
  assert.match(result.detail ?? "", /MULTICA_TOKEN: absent/);
  assert.equal(
    result.hint,
    "Rename/remove stale context file; Set MULTICA_TOKEN environment variable",
  );
});

test("auth_context surfaces probe runtime errors as check failures", () => {
  const result = checkAuthContext({
    cwd: () => {
      throw new Error("permission denied");
    },
    existsSync: () => false,
    getToken: () => "test-token",
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /auth_context probe error: permission denied/);
  assert.match(result.hint ?? "", /retry/i);
});

test("multicaDoctorCheck includes auth_context failure in failures array", () => {
  const result = multicaDoctorCheck({
    authContext: {
      cwd: () => "/workspace",
      existsSync: () => true,
      getToken: () => undefined,
    },
  });

  assert.equal(result.pass, false);
  assert.equal(result.fail_count, 1);
  assert.equal(result.failures[0]?.check, "auth_context");
});
