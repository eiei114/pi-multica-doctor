import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  checkFeedbackJsonl,
  countInvalidJsonlLines,
  FEEDBACK_EVENTS_RELATIVE,
  resolveFeedbackEventsDir,
  validateFeedbackJsonlFiles,
} from "../src/probes/feedback_jsonl.ts";

const vaultRoot = "/vault";
const eventsDir = join(vaultRoot, FEEDBACK_EVENTS_RELATIVE);

const validJsonl = [
  '{"event":"ok","count":1}',
  '{"event":"also_ok","count":2}',
].join("\n");

const malformedJsonl = [
  '{"event":"ok"}',
  "not-json",
  '{"broken":',
].join("\n");

const healthyFeedbackJsonl = {
  cwd: () => vaultRoot,
  getVaultRoot: () => undefined,
  existsSync: (path) => path === eventsDir,
  readdirSync: () => ["2026-08.jsonl"],
  readFileSync: (path) => {
    if (path === join(eventsDir, "2026-08.jsonl")) {
      return validJsonl;
    }
    throw new Error(`unexpected read: ${path}`);
  },
};

test("countInvalidJsonlLines returns 0 for valid JSONL", () => {
  assert.equal(countInvalidJsonlLines(validJsonl), 0);
});

test("countInvalidJsonlLines skips empty lines", () => {
  assert.equal(
    countInvalidJsonlLines('{"event":"ok"}\n\n{"event":"also_ok"}\n'),
    0,
  );
});

test("countInvalidJsonlLines counts malformed lines", () => {
  assert.equal(countInvalidJsonlLines(malformedJsonl), 2);
});

test("validateFeedbackJsonlFiles reports files with invalid lines", () => {
  const problems = validateFeedbackJsonlFiles([
    { filename: "good.jsonl", content: validJsonl },
    { filename: "bad.jsonl", content: malformedJsonl },
  ]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.filename, "bad.jsonl");
  assert.equal(problems[0]?.invalidLineCount, 2);
});

test("checkFeedbackJsonl passes when all JSONL lines are valid", () => {
  const result = checkFeedbackJsonl(healthyFeedbackJsonl);

  assert.equal(result.status, "pass");
  assert.match(result.detail ?? "", /valid JSON lines/i);
});

test("checkFeedbackJsonl fails when directory is missing", () => {
  const result = checkFeedbackJsonl({
    cwd: () => vaultRoot,
    getVaultRoot: () => undefined,
    existsSync: () => false,
    readdirSync: () => {
      throw new Error("should not list");
    },
    readFileSync: () => {
      throw new Error("should not read");
    },
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /feedback-events directory not found/i);
  assert.match(result.hint ?? "", /OBSIDIAN_VAULT_ROOT/i);
});

test("checkFeedbackJsonl fails on malformed JSON lines with file name and count", () => {
  const result = checkFeedbackJsonl({
    ...healthyFeedbackJsonl,
    readdirSync: () => ["broken.jsonl"],
    readFileSync: (path) => {
      if (path === join(eventsDir, "broken.jsonl")) {
        return malformedJsonl;
      }
      throw new Error(`unexpected read: ${path}`);
    },
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /2 total invalid line\(s\)/);
  assert.match(result.detail ?? "", /broken\.jsonl: 2 invalid line\(s\)/);
  assert.equal(result.hint, "Fix malformed JSON lines in broken.jsonl");
});

test("checkFeedbackJsonl fails when file read errors occur", () => {
  const result = checkFeedbackJsonl({
    ...healthyFeedbackJsonl,
    readFileSync: () => {
      throw new Error("permission denied");
    },
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /failed to read 2026-08\.jsonl: permission denied/);
});

test("checkFeedbackJsonl scans all .jsonl files in feedback-events", () => {
  const readPaths = [];
  const result = checkFeedbackJsonl({
    ...healthyFeedbackJsonl,
    readdirSync: () => ["a.jsonl", "notes.txt", "b.jsonl"],
    readFileSync: (path) => {
      readPaths.push(path);
      return validJsonl;
    },
  });

  assert.equal(result.status, "pass");
  assert.deepEqual(readPaths, [
    join(eventsDir, "a.jsonl"),
    join(eventsDir, "b.jsonl"),
  ]);
});

test("resolveFeedbackEventsDir prefers OBSIDIAN_VAULT_ROOT", () => {
  const path = resolveFeedbackEventsDir({
    cwd: () => "/ignored",
    getVaultRoot: () => "/env-vault",
    existsSync: () => true,
    readdirSync: () => [],
    readFileSync: () => "",
  });

  assert.equal(path, join("/env-vault", FEEDBACK_EVENTS_RELATIVE));
});

test("checkFeedbackJsonl never throws", () => {
  assert.doesNotThrow(() =>
    checkFeedbackJsonl({
      cwd: () => {
        throw new Error("boom");
      },
      getVaultRoot: () => undefined,
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => "",
    }),
  );
});
