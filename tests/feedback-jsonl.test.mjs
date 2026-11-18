import assert from "node:assert/strict";
import { basename, join } from "node:path";
import test from "node:test";

import {
  checkFeedbackJsonl,
  FEEDBACK_EVENTS_RELATIVE,
  findInvalidJsonlLines,
  MAX_EXCERPT_CHARS,
  MAX_REPORTED_LINES,
} from "../src/probes/feedback_jsonl.ts";

const depsFor = (filenames) => ({
  cwd: () => "/workspace",
  discoverJsonlFiles: () => filenames.map((name) => join("/workspace", name)),
  readText: (path) => filesContent[basename(path)] ?? "",
});

// Content is looked up by the file's basename so injected paths stay simple.
let filesContent = {};
const withFiles = (files) => {
  filesContent = files;
  return depsFor(Object.keys(files));
};

test("FEEDBACK_EVENTS_RELATIVE points at the vault feedback-events folder", () => {
  assert.equal(
    FEEDBACK_EVENTS_RELATIVE,
    join("4_Project", "Multica-Agent-Strategy", "Data", "feedback-events"),
  );
});

test("feedback_jsonl passes on a well-formed file set", () => {
  const deps = withFiles({
    "2026-11.jsonl": '{"id":1}\n{"id":2}\n\n{"id":3}\n',
  });

  const result = checkFeedbackJsonl(deps);

  assert.equal(result.check, "feedback_jsonl");
  assert.equal(result.status, "pass");
  assert.match(result.detail ?? "", /1 feedback-events JSONL file\(s\) have valid JSON lines/);
});

test("feedback_jsonl passes when the directory is present but has no .jsonl files", () => {
  const deps = withFiles({});

  const result = checkFeedbackJsonl(deps);

  assert.equal(result.status, "pass");
  assert.match(result.detail ?? "", /no \.jsonl files/);
});

test("feedback_jsonl fails on a file containing one invalid JSON line", () => {
  const deps = withFiles({
    "2026-11.jsonl": '{"id":1}\nthis-is-not-json\n{"id":3}\n',
  });

  const result = checkFeedbackJsonl(deps);

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /1 invalid JSON line\(s\)/);
  assert.match(result.detail ?? "", /2026-11\.jsonl:2/);
  assert.match(result.hint ?? "", /bad line excerpt: this-is-not-json/);
});

test("feedback_jsonl reports a pretty-printed multi-line event as a failure", () => {
  const pretty = '{\n  "id": 1,\n  "kind": "feedback"\n}';
  const deps = withFiles({ "2026-06.jsonl": pretty });

  const result = checkFeedbackJsonl(deps);

  assert.equal(result.status, "fail");
  // Each physical line is parsed on its own; the opening brace on line 1 fails.
  assert.match(result.detail ?? "", /2026-06\.jsonl:1/);
  assert.match(result.detail ?? "", /invalid JSON line\(s\)/);
});

test("feedback_jsonl failure detail is bounded and embeds only a short excerpt", () => {
  const longBadLine = "X".repeat(MAX_EXCERPT_CHARS + 100);
  const lines = Array.from({ length: MAX_REPORTED_LINES + 3 }, () => longBadLine);
  const deps = withFiles({ "many.jsonl": lines.join("\n") });

  const result = checkFeedbackJsonl(deps);

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /and 3 more/);
  const detailEntries = (result.detail ?? "").split("; ").filter((p) => /many\.jsonl:\d+/.test(p));
  assert.equal(detailEntries.length, MAX_REPORTED_LINES);
  // Only one bounded excerpt is carried in the hint, never the whole corrupt line.
  assert.ok((result.hint ?? "").length < MAX_EXCERPT_CHARS + 120);
  assert.ok((result.hint ?? "").includes("…"));
  assert.ok(!(result.hint ?? "").includes(longBadLine));
});

test("feedback_jsonl safely bounds details for 150,000 invalid lines", () => {
  const content = new Array(150_000).fill("not-json").join("\n");
  const result = checkFeedbackJsonl({
    cwd: () => "/workspace",
    discoverJsonlFiles: () => ["/feedback/large.jsonl"],
    readText: () => content,
  });

  assert.equal(result.status, "fail");
  assert.equal(
    result.detail,
    "150000 invalid JSON line(s): large.jsonl:1; large.jsonl:2; large.jsonl:3; large.jsonl:4; large.jsonl:5; and 149995 more",
  );
  assert.ok((result.hint ?? "").length < MAX_EXCERPT_CHARS + 120);
  assert.ok(!(result.hint ?? "").includes(content));
});

test("feedback_jsonl degrades a missing/unreadable directory to a check failure", () => {
  const deps = {
    cwd: () => "/workspace",
    discoverJsonlFiles: () => {
      throw new Error("permission denied");
    },
    readText: () => "",
  };

  let result;
  assert.doesNotThrow(() => {
    result = checkFeedbackJsonl(deps);
  });
  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /feedback_jsonl probe error: permission denied/);
  assert.match(result.hint ?? "", /feedback-events is readable/);
});

test("feedback_jsonl degrades an unreadable file to a check failure", () => {
  const deps = {
    cwd: () => "/workspace",
    discoverJsonlFiles: () => ["/workspace/feedback-events/2026-11.jsonl"],
    readText: () => {
      throw new Error("EACCES");
    },
  };

  let result;
  assert.doesNotThrow(() => {
    result = checkFeedbackJsonl(deps);
  });
  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /failed to read 2026-11\.jsonl: EACCES/);
});

test("findInvalidJsonlLines skips blank lines and reports 1-based line numbers", () => {
  const invalid = findInvalidJsonlLines("events.jsonl", '\n{"ok":1}\n\nbad\n');

  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].line, 4);
  assert.equal(invalid[0].filename, "events.jsonl");
});

test("checkFeedbackJsonl never throws when deps throw", () => {
  assert.doesNotThrow(() =>
    checkFeedbackJsonl({
      cwd: () => {
        throw new Error("boom");
      },
      discoverJsonlFiles: () => {
        throw new Error("boom");
      },
      readText: () => {
        throw new Error("boom");
      },
    }),
  );
});
