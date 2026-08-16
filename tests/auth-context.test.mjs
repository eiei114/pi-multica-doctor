import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  checkAuthContext,
  DAEMON_TASK_CONTEXT_RELATIVE,
} from "../src/probes/auth_context.ts";

test("DAEMON_TASK_CONTEXT_RELATIVE points at .multica/daemon_task_context.json", () => {
  assert.equal(
    DAEMON_TASK_CONTEXT_RELATIVE,
    join(".multica", "daemon_task_context.json"),
  );
});

test("checkAuthContext never throws", () => {
  assert.doesNotThrow(() =>
    checkAuthContext({
      cwd: () => {
        throw new Error("boom");
      },
      existsSync: () => {
        throw new Error("boom");
      },
      getToken: () => {
        throw new Error("boom");
      },
    }),
  );
});
