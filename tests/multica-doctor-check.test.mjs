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

const healthyFeedbackJsonl = {
  cwd: () => "/workspace",
  discoverJsonlFiles: () => [join("/workspace", "feedback-events", "2026-11.jsonl")],
  readText: () => '{"id":1}\n{"id":2}\n',
};

const healthyDeps = {
  authContext: healthyAuthContext,
  feedbackJsonl: healthyFeedbackJsonl,
};

test("multicaDoctorCheck returns the expected JSON contract shape", () => {
  const result = multicaDoctorCheck(healthyDeps);

  assert.deepEqual(result.checks, [...CHECK_NAMES]);
  assert.equal(result.pass, true);
  assert.equal(result.fail_count, 0);
  assert.deepEqual(result.failures, []);
});

test("multicaDoctorCheck lists all five probes", () => {
  const result = multicaDoctorCheck(healthyDeps);

  assert.equal(result.checks.length, 5);
  assert.deepEqual(result.checks, [
    "auth_context",
    "cli_syntax",
    "registry_tables",
    "feedback_jsonl",
    "stuck_runs",
  ]);
});

test("non-implemented probes remain stubbed as pass", () => {
  const results = getProbeResults(healthyDeps);

  assert.equal(results.length, 5);
  for (const probe of results) {
    assert.ok(CHECK_NAMES.includes(probe.check));
    if (
      probe.check !== "auth_context" &&
      probe.check !== "feedback_jsonl"
    ) {
      assert.equal(probe.status, "pass");
    }
  }
});

test("feedback_jsonl is a real probe in getProbeResults", () => {
  const results = getProbeResults(healthyDeps);
  const feedback = results.find((probe) => probe.check === "feedback_jsonl");

  assert.ok(feedback);
  assert.equal(feedback.status, "pass");
  assert.match(feedback.detail ?? "", /valid JSON lines/);
});

test("multicaDoctorCheck never throws", () => {
  assert.doesNotThrow(() => multicaDoctorCheck(healthyDeps));
});

test("a throwing probe fails only its check and does not stop later probes", () => {
  const message = "feedback file access denied";
  const options = {
    ...healthyDeps,
    probeOverrides: {
      feedback_jsonl: () => {
        throw new Error(message);
      },
    },
  };

  const probes = getProbeResults(options);
  assert.deepEqual(probes.map(({ check }) => check), [...CHECK_NAMES]);
  assert.deepEqual(
    probes.filter(({ check }) => check !== "feedback_jsonl").map(({ status }) => status),
    ["pass", "pass", "pass", "pass"],
  );
  assert.equal(probes.find(({ check }) => check === "feedback_jsonl")?.status, "fail");

  const result = multicaDoctorCheck(options);
  assert.deepEqual(result.checks, [...CHECK_NAMES]);
  assert.equal(result.pass, false);
  assert.equal(result.fail_count, 1);
  assert.equal(result.failures[0]?.check, "feedback_jsonl");
  assert.equal(
    result.failures[0]?.detail,
    `feedback_jsonl probe error: ${message}`,
  );
  assert.doesNotMatch(result.failures[0]?.hint ?? "", new RegExp(message));
  assert.equal(JSON.stringify(result).split(message).length - 1, 1);
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
    feedbackJsonl: healthyFeedbackJsonl,
  });

  assert.equal(result.pass, false);
  assert.equal(result.fail_count, 1);
  assert.equal(result.failures[0]?.check, "auth_context");
});

test("multicaDoctorCheck includes feedback_jsonl failure in failures array", () => {
  const result = multicaDoctorCheck({
    authContext: healthyAuthContext,
    feedbackJsonl: {
      cwd: () => "/workspace",
      discoverJsonlFiles: () => [join("/workspace", "feedback-events", "2026-11.jsonl")],
      readText: () => '{"ok":true}\nbroken-line\n',
    },
  });

  assert.equal(result.pass, false);
  assert.equal(result.fail_count, 1);
  assert.equal(result.failures[0]?.check, "feedback_jsonl");
  assert.match(result.failures[0]?.detail ?? "", /2026-11\.jsonl:2/);
});

test("multicaDoctorCheck still returns the full contract when a directory is missing", () => {
  const result = multicaDoctorCheck({
    authContext: healthyAuthContext,
    feedbackJsonl: {
      cwd: () => "/workspace",
      discoverJsonlFiles: () => {
        throw new Error("directory missing");
      },
      readText: () => "",
    },
  });

  assert.deepEqual(result.checks, [...CHECK_NAMES]);
  assert.equal(result.pass, false);
  assert.equal(result.fail_count, 1);
  assert.equal(result.failures[0]?.check, "feedback_jsonl");
  assert.match(result.failures[0]?.detail ?? "", /directory missing/);
});
