import { execSync } from "node:child_process";

import type { ProbeResult } from "../multica_doctor_check.ts";

export const CLI_STATUS_HELP_COMMAND = "multica issue status --help";

/** Positional `status <id> <value>` usage line (whitespace/casing normalized). */
export const POSITIONAL_STATUS_PATTERN = /status\s+<[^>]+>\s+<[^>]+>/;

export interface CliSyntaxDeps {
  execHelp: () => string;
}

const defaultDeps = (): CliSyntaxDeps => ({
  execHelp: () =>
    execSync(CLI_STATUS_HELP_COMMAND, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }),
});

/**
 * Normalize CLI help text for stable pattern matching.
 */
export function normalizeHelpText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect positional `status <id> <status>` syntax in normalized help text.
 */
export function hasPositionalStatusSyntax(normalizedHelp: string): boolean {
  return POSITIONAL_STATUS_PATTERN.test(normalizedHelp);
}

/**
 * Validate Multica CLI issue status command syntax via read-only --help output.
 */
export function checkCliSyntax(
  deps: CliSyntaxDeps = defaultDeps(),
): ProbeResult {
  try {
    const helpText = deps.execHelp();
    const normalized = normalizeHelpText(helpText);

    if (hasPositionalStatusSyntax(normalized)) {
      return {
        check: "cli_syntax",
        status: "pass",
        detail: `Detected positional status syntax in \`${CLI_STATUS_HELP_COMMAND}\``,
      };
    }

    return {
      check: "cli_syntax",
      status: "fail",
      detail:
        "Expected positional `status <id> <status>` pattern not found in CLI help",
      hint: "CLI syntax may have changed; check `multica issue status --help`",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isMissingCli =
      message.includes("ENOENT") ||
      message.includes("not found") ||
      message.includes("not recognized");

    return {
      check: "cli_syntax",
      status: "fail",
      detail: isMissingCli
        ? `multica CLI not available (${CLI_STATUS_HELP_COMMAND})`
        : `cli_syntax probe error: ${message}`,
      hint: isMissingCli
        ? "Install multica CLI and ensure it is on PATH"
        : "CLI syntax may have changed; check `multica issue status --help`",
    };
  }
}
