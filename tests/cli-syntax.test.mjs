import assert from "node:assert/strict";
import test from "node:test";

import {
  checkCliSyntax,
  CLI_STATUS_HELP_COMMAND,
  hasPositionalStatusSyntax,
  normalizeHelpText,
  POSITIONAL_STATUS_PATTERN,
} from "../src/probes/cli_syntax.ts";

const validHelp = `
Change an issue's status.

USAGE
  multica issue status <id> <status> [flags]
`;

const driftedHelp = `
Change an issue's status.

USAGE
  multica issue status <id> --set <status> [flags]
`;

const healthyCliSyntax = {
  execHelp: () => validHelp,
};

test("normalizeHelpText lowercases and collapses whitespace", () => {
  assert.equal(
    normalizeHelpText(`  MULTICA   issue
status  <ID>  <STATUS>  `),
    "multica issue status <id> <status>",
  );
});

test("POSITIONAL_STATUS_PATTERN matches normalized positional usage", () => {
  const normalized = normalizeHelpText(validHelp);
  assert.match(normalized, POSITIONAL_STATUS_PATTERN);
  assert.equal(hasPositionalStatusSyntax(normalized), true);
});

test("hasPositionalStatusSyntax rejects drifted --set-only help", () => {
  const normalized = normalizeHelpText(driftedHelp);
  assert.equal(hasPositionalStatusSyntax(normalized), false);
});

test("checkCliSyntax passes when positional status syntax is present", () => {
  const result = checkCliSyntax(healthyCliSyntax);

  assert.equal(result.status, "pass");
  assert.match(result.detail ?? "", /positional status syntax/i);
  assert.match(result.detail ?? "", /multica issue status --help/);
});

test("checkCliSyntax fails with actionable hint when syntax drifts", () => {
  const result = checkCliSyntax({
    execHelp: () => driftedHelp,
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /pattern not found/i);
  assert.equal(
    result.hint,
    "CLI syntax may have changed; check `multica issue status --help`",
  );
});

test("checkCliSyntax fails gracefully when multica CLI is missing", () => {
  const result = checkCliSyntax({
    execHelp: () => {
      const error = new Error(
        `spawn multica ENOENT: command not found (${CLI_STATUS_HELP_COMMAND})`,
      );
      throw error;
    },
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /multica CLI not available/i);
  assert.match(result.hint ?? "", /install multica cli/i);
});

test("checkCliSyntax surfaces unexpected exec errors as check failures", () => {
  const result = checkCliSyntax({
    execHelp: () => {
      throw new Error("permission denied");
    },
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /cli_syntax probe error: permission denied/);
  assert.match(result.hint ?? "", /multica issue status --help/);
});

test("checkCliSyntax never throws", () => {
  assert.doesNotThrow(() =>
    checkCliSyntax({
      execHelp: () => {
        throw new Error("boom");
      },
    }),
  );
});
