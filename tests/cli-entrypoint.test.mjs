import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../bin/multica-doctor-check.js";

test("CLI prints a JSON failure contract and exits non-zero if result building throws", () => {
  const output = [];
  let exitCode = 0;

  assert.doesNotThrow(() =>
    runCli(
      () => {
        throw new Error("result builder unavailable");
      },
      { write: (chunk) => output.push(chunk) },
      (code) => {
        exitCode = code;
      },
    ),
  );

  const stdout = output.join("");
  const result = JSON.parse(stdout);
  assert.equal(stdout.endsWith("\n"), true);
  assert.deepEqual(Object.keys(result), ["checks", "pass", "fail_count", "failures"]);
  assert.equal(result.pass, false);
  assert.equal(result.fail_count, 1);
  assert.equal(result.failures[0].check, "multica_doctor_check");
  assert.equal(
    result.failures[0].detail,
    "multica_doctor_check error: result builder unavailable",
  );
  assert.equal(exitCode, 1);
});
