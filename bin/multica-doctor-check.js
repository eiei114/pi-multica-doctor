#!/usr/bin/env node

/**
 * pi-multica-doctor CLI entry point
 *
 * Calls multicaDoctorCheck() and prints formatted JSON to stdout.
 */

import { multicaDoctorCheck } from "../src/multica_doctor_check.ts";

const result = multicaDoctorCheck();
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
