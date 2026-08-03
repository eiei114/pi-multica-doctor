/**
 * pi-multica-doctor Pi extension
 *
 * Registers the `multica_doctor_check` tool and `/multica-doctor-check` slash command.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  multicaDoctorCheck,
  type MulticaDoctorResult,
} from "../src/multica_doctor_check.ts";

const emptyParameters = Type.Object({});

export default function (pi: ExtensionAPI) {
  pi.registerCommand("multica-doctor-check", {
    description:
      "Run Multica workspace health diagnostics (auth, CLI syntax, registry, JSONL, stuck runs)",
    handler: async (_args, ctx) => {
      const result = multicaDoctorCheck();
      const formatted = JSON.stringify(result, null, 2);
      if (ctx.hasUI) {
        ctx.ui.notify(
          result.pass
            ? "Multica workspace checks passed"
            : `${result.fail_count} Multica workspace check(s) failed`,
          result.pass ? "info" : "warning",
        );
      }
      console.log(formatted);
    },
  });

  pi.registerTool({
    name: "multica_doctor_check",
    label: "Multica Doctor Check",
    description:
      "Run read-only Multica workspace health probes and return a compact JSON report",
    promptSnippet:
      "multica_doctor_check: diagnose Multica CLI/auth/registry/JSONL/stuck-run health",
    promptGuidelines: [
      "Use multica_doctor_check when Multica CLI commands fail or before starting Multica-heavy work.",
      "The tool is read-only — it surfaces problems and hints but does not repair them.",
    ],
    parameters: emptyParameters,
    async execute(_toolCallId, _params, signal, _onUpdate, _ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }], details: {} };
      }

      const result = multicaDoctorCheck();
      const formatted = JSON.stringify(result, null, 2);

      return {
        content: [{ type: "text", text: formatted }],
        details: result,
      };
    },

    renderCall(_args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("multica_doctor_check")), 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as MulticaDoctorResult | undefined;
      const status = details?.pass ? "pass" : "fail";
      const failCount = details?.fail_count ?? 0;

      let text =
        theme.fg(details?.pass ? "success" : "warning", `→ ${status}`) +
        theme.fg("dim", ` (${failCount} failure(s))`);

      if (expanded && details) {
        text += `\n${theme.fg("dim", `checks: ${details.checks.join(", ")}`)}`;
      }

      return new Text(text, 0, 0);
    },
  });
}
