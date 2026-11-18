#!/usr/bin/env node

/**
 * pi-multica-doctor CLI entry point
 *
 * Calls multicaDoctorCheck() and prints formatted JSON to stdout.
 */

import { pathToFileURL } from "node:url";
import {
  multicaDoctorCheck,
  runDoctorCheckSafely,
} from "../src/multica_doctor_check.ts";

export function runCli(
  buildResult = multicaDoctorCheck,
  stdout = process.stdout,
  setExitCode = (code) => {
    process.exitCode = code;
  },
) {
  const result = runDoctorCheckSafely(buildResult);
  stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.pass) setExitCode(1);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
