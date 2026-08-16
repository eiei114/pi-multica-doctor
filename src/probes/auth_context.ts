import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ProbeResult } from "../multica_doctor_check.ts";

export const DAEMON_TASK_CONTEXT_RELATIVE = join(
  ".multica",
  "daemon_task_context.json",
);

export interface AuthContextDeps {
  cwd: () => string;
  existsSync: (path: string) => boolean;
  getToken: () => string | undefined;
}

const defaultDeps = (): AuthContextDeps => ({
  cwd: () => process.cwd(),
  existsSync,
  getToken: () => process.env.MULTICA_TOKEN,
});

/**
 * Validate Multica auth context: no stale daemon marker and MULTICA_TOKEN set.
 *
 * A leftover `.multica/daemon_task_context.json` blocks user-token CLI calls.
 * Token presence is reported as present/absent only — the value is never read.
 */
export function checkAuthContext(
  deps: AuthContextDeps = defaultDeps(),
): ProbeResult {
  try {
    const contextPath = join(deps.cwd(), DAEMON_TASK_CONTEXT_RELATIVE);
    const contextFilePresent = deps.existsSync(contextPath);
    const tokenPresent = Boolean(deps.getToken());

    const problems: string[] = [];
    const hints: string[] = [];

    if (contextFilePresent) {
      problems.push(
        `daemon_task_context.json: present (${DAEMON_TASK_CONTEXT_RELATIVE})`,
      );
      hints.push("Rename/remove stale context file");
    } else {
      // Healthy: no stale daemon marker on disk.
    }

    if (!tokenPresent) {
      problems.push("MULTICA_TOKEN: absent");
      hints.push("Set MULTICA_TOKEN environment variable");
    }

    if (problems.length === 0) {
      return {
        check: "auth_context",
        status: "pass",
        detail: "daemon_task_context.json: absent; MULTICA_TOKEN: present",
      };
    }

    return {
      check: "auth_context",
      status: "fail",
      detail: problems.join("; "),
      hint: hints.join("; "),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      check: "auth_context",
      status: "fail",
      detail: `auth_context probe error: ${message}`,
      hint: "Fix auth context probe prerequisites and retry",
    };
  }
}
