import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const piPackage = "@earendil-works/pi-coding-agent";
const piVersion = "1.2.0";
const npmCli = process.env.npm_execpath;

function runNpm(args, cwd, timeout) {
  assert.ok(npmCli, "run this compatibility check through npm so npm_execpath is available");
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `npm ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

test("published package installs alongside the Pi 1.2.0 host", { timeout: 180_000 }, () => {
  const temp = mkdtempSync(join(tmpdir(), "pi-multica-doctor-peer-"));
  const packedDir = join(temp, "packed");
  const installDir = join(temp, "install");
  mkdirSync(packedDir);
  mkdirSync(installDir);

  try {
    const packResult = runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", packedDir], root, 30_000);
    const [packed] = JSON.parse(packResult.stdout);
    assert.equal(packed.name, "pi-multica-doctor");

    const tarball = readdirSync(packedDir).find((file) => file.endsWith(".tgz"));
    assert.ok(tarball, "npm pack must produce the package tarball");
    writeFileSync(join(installDir, "package.json"), `${JSON.stringify({
      name: "pi-multica-doctor-peer-install-fixture",
      version: "1.0.0",
      private: true,
      dependencies: {
        [piPackage]: piVersion,
        "pi-multica-doctor": `file:../packed/${tarball}`,
      },
    }, null, 2)}\n`);

    runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"], installDir, 120_000);

    const installedPackage = JSON.parse(readFileSync(
      join(installDir, "node_modules/pi-multica-doctor/package.json"), "utf8",
    ));
    const installedPi = JSON.parse(readFileSync(
      join(installDir, "node_modules", piPackage, "package.json"), "utf8",
    ));
    assert.equal(installedPackage.peerDependencies?.[piPackage], "*");
    assert.equal(installedPi.version, piVersion);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
