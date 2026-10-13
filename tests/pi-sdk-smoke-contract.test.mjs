import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  parseJsonLines,
  SDK_VERSIONS,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const registration = {
  type: "response",
  id: "commands",
  command: "get_commands",
  success: true,
  data: { commands: [{ name: "multica-doctor-check", source: "extension" }] },
};
const prompt = {
  type: "response",
  id: "doctor",
  command: "prompt",
  success: true,
  data: { disposition: "handled" },
};
const healthyResult = {
  checks: ["auth_context", "cli_syntax", "registry_tables", "feedback_jsonl", "stuck_runs"],
  pass: true,
  fail_count: 0,
  failures: [],
};
const missingTokenResult = {
  ...healthyResult,
  pass: false,
  fail_count: 1,
  failures: [{ check: "auth_context", detail: "MULTICA_TOKEN: absent" }],
};
const closedProcess = (responses = [registration, prompt], doctorResult = healthyResult, overrides = {}) => ({
  exit_code: 0,
  timed_out: false,
  spawn_error: null,
  fullOutput: "",
  responses,
  doctorResult,
  ...overrides,
});

test("compatibility contract pins all four frozen Pi SDK packages", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(SDK_VERSIONS, {
    "@earendil-works/pi-agent-core": "1.1.0",
    "@earendil-works/pi-ai": "1.1.0",
    "@earendil-works/pi-coding-agent": "1.1.0",
    "@earendil-works/pi-tui": "1.1.0",
  });
});

test("RPC JSONL parser accepts LF and CRLF while ignoring malformed records", () => {
  assert.deepEqual(parseJsonLines(`invalid\r\n${JSON.stringify(prompt)}\n\n`), [prompt]);
});

test("extension_load requires actual get_commands registration from the extension", () => {
  assert.equal(behaviorAssertions("extension_load", { responses: [registration] })[0].passed, true);
  for (const responses of [[], [{ ...registration, success: false }],
    [{ ...registration, data: { commands: [{ name: "other", source: "extension" }] } }],
    [{ ...registration, data: { commands: [{ name: "multica-doctor-check", source: "prompt" }] } }]]) {
    assert.equal(behaviorAssertions("extension_load", { responses })[0].passed, false);
  }
});

test("happy_path requires a handled real feature response with all five healthy probes", () => {
  const good = behaviorAssertions("happy_path", {
    responses: [prompt], doctorResult: healthyResult, tokenLeak: false,
  });
  assert.deepEqual(good.map((item) => item.id), ["feature_response"]);
  assert.equal(good[0].passed, true);
  for (const details of [
    { responses: [], doctorResult: healthyResult, tokenLeak: false },
    { responses: [{ ...prompt, success: false }], doctorResult: healthyResult, tokenLeak: false },
    { responses: [prompt], doctorResult: null, tokenLeak: false },
    { responses: [prompt], doctorResult: { ...healthyResult, fail_count: 1 }, tokenLeak: false },
    { responses: [prompt], doctorResult: healthyResult, tokenLeak: true },
  ]) {
    assert.equal(behaviorAssertions("happy_path", details)[0].passed, false);
  }
});

test("error_path requires the handled missing-token diagnostic, not just a successful process", () => {
  assert.equal(behaviorAssertions("error_path", {
    responses: [prompt], doctorResult: missingTokenResult,
  })[0].passed, true);
  for (const details of [
    { responses: [], doctorResult: missingTokenResult },
    { responses: [prompt], doctorResult: healthyResult },
    { responses: [prompt], doctorResult: { ...missingTokenResult, failures: [] } },
    { responses: [prompt], doctorResult: { ...missingTokenResult, fail_count: 2 } },
  ]) {
    assert.equal(behaviorAssertions("error_path", details)[0].passed, false);
  }
});

test("reload_cleanup requires second-process registration and feature response plus clean exits", () => {
  const firstProcess = closedProcess();
  const secondProcess = closedProcess();
  const good = behaviorAssertions("reload_cleanup", { firstProcess, secondProcess });
  assert.deepEqual(good.map((item) => item.id), [
    "reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown",
  ]);
  assert.ok(good.every((item) => item.passed));
  const missingRegistration = behaviorAssertions("reload_cleanup", {
    firstProcess, secondProcess: closedProcess([], healthyResult),
  });
  assert.equal(missingRegistration[0].passed, false, "missing second-process registration must fail");
  assert.equal(missingRegistration[1].passed, false, "missing second-process feature response must fail");
  for (const changedSecond of [
    closedProcess([registration], healthyResult),
    closedProcess([registration, { ...prompt, success: false }], healthyResult),
    closedProcess([registration, prompt], null),
  ]) {
    const assertions = behaviorAssertions("reload_cleanup", { firstProcess, secondProcess: changedSecond });
    assert.equal(assertions[0].passed, true);
    assert.equal(assertions[1].passed, false, "missing or invalid second-process feature response must fail");
  }
  for (const badFirst of [
    closedProcess(undefined, undefined, { exit_code: null, timed_out: true }),
    closedProcess(undefined, undefined, { exit_code: 1 }),
    closedProcess(undefined, undefined, { fullOutput: "shutdown error" }),
    closedProcess(undefined, undefined, { fullOutput: "UnhandledPromiseRejection" }),
    closedProcess(undefined, undefined, { fullOutput: "extension disposal failed" }),
  ]) {
    assert.equal(behaviorAssertions("reload_cleanup", { firstProcess: badFirst, secondProcess })[2].passed, false);
  }
});

test("host_shell requires exact local Pi version output and clean process exit", () => {
  assert.equal(behaviorAssertions("host_shell", {
    process: closedProcess([], null), shellOutput: "1.1.0\r\n", expectedVersion: "1.1.0",
  })[0].passed, true);
  for (const [stdout, exitCode] of [["", 0], ["11.1.0", 0], ["1.1.0 with warning", 0], ["1.1.0", 1]]) {
    assert.equal(behaviorAssertions("host_shell", {
      process: closedProcess([], null, { exit_code: exitCode }), shellOutput: stdout,
      expectedVersion: "1.1.0",
    })[0].passed, false);
  }
});
