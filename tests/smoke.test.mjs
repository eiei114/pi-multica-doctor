import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const ciWorkflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const autoReleaseWorkflow = await readFile(
  new URL("../.github/workflows/auto-release.yml", import.meta.url),
  "utf8",
);
const publishWorkflow = await readFile(
  new URL("../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);
const registerExtension = (await import("../extensions/index.ts")).default;

test("package declares pi extension", () => {
  assert.deepEqual(packageJson.pi.extensions, ["./extensions"]);
});

test("package declares multica-doctor-check command", () => {
  assert.equal(
    packageJson.pi.commands["multica-doctor-check"],
    "./bin/multica-doctor-check.js",
  );
});

test("package is discoverable as a Pi package", () => {
  assert.ok(packageJson.keywords.includes("pi-package"));
});

test("package uses public publish config", () => {
  assert.equal(packageJson.publishConfig.access, "public");
});

test("ci workflow runs tests on push and pull_request", () => {
  assert.match(ciWorkflow, /on:\s*[\s\S]*push:/);
  assert.match(ciWorkflow, /pull_request:/);
  assert.match(ciWorkflow, /npm run ci/);
});

test("extension module loads and registers multica_doctor_check tool", () => {
  assert.equal(typeof registerExtension, "function");

  const commands = [];
  const tools = [];

  registerExtension({
    registerCommand(name, spec) {
      commands.push({ name, ...spec });
    },
    registerTool(spec) {
      tools.push(spec);
    },
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, "multica-doctor-check");
  assert.match(commands[0].description, /Multica workspace health/i);
  assert.equal(typeof commands[0].handler, "function");

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "multica_doctor_check");
  assert.equal(typeof tools[0].execute, "function");
});

test("template includes npm release workflow handoff", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /npm publish --access public/);
});
