import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  SDK_VERSIONS,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
  parseJsonLines,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = process.argv.includes("--update-curated-report")
  ? resolve(root, "docs/verification/pi-sdk-smoke.json")
  : resolve(root, ".tmp/pi-sdk-smoke.json");
const extensionPath = resolve(root, "extensions/index.ts");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(Object.keys(SDK_VERSIONS).map((name) => {
  const installed = readJson(resolve(root, "node_modules", name, "package.json")).version;
  if (manifest.devDependencies?.[name] !== SDK_VERSIONS[name] || installed !== SDK_VERSIONS[name]) {
    throw new Error(`Smoke requires ${name} pinned and installed at ${SDK_VERSIONS[name]} (found ${manifest.devDependencies?.[name]} / ${installed})`);
  }
  return [name, installed];
}));

const piManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piBin = typeof piManifest.bin === "string" ? piManifest.bin : piManifest.bin?.pi;
if (typeof piBin !== "string") throw new Error("The pinned Pi SDK package does not declare a pi CLI binary");
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piBin);
const agentDir = mkdtempSync(resolve(tmpdir(), "pi-multica-doctor-agent-"));
const fixtureDir = mkdtempSync(resolve(tmpdir(), "pi-multica-doctor-cwd-"));
const timeoutMs = 15_000;
const cleanupGraceMs = 1_000;
const smokeToken = "pi-sdk-smoke-sentinel-not-a-credential";
const pathRedactions = [
  [process.execPath, "<node>"],
  [piCli, "<pi-cli>"],
  [extensionPath, "<extension>"],
  [root, "<repo>"],
  [agentDir, "<isolated-agent-dir>"],
  [fixtureDir, "<isolated-cwd>"],
  [tmpdir(), "<temp>"],
].flatMap(([path, replacement]) => [
  [path, replacement],
  [path.replaceAll("\\", "\\\\"), replacement],
]).sort(([left], [right]) => right.length - left.length);

function sanitizeText(value) {
  let result = value;
  for (const [path, replacement] of pathRedactions) result = result.replaceAll(path, replacement);
  return result;
}

function sanitizeValue(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeValue(child)]));
  }
  return value;
}

function isolatedEnv(token) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(API_KEY|ACCESS_TOKEN|_TOKEN$|SECRET|PASSWORD|OAUTH|AWS_PROFILE)/i.test(key)) delete env[key];
  }
  env.PI_CODING_AGENT_DIR = agentDir;
  env.PI_OFFLINE = "1";
  if (token === undefined) delete env.MULTICA_TOKEN;
  else env.MULTICA_TOKEN = token;
  return env;
}

function waitFor(promise, milliseconds) {
  return new Promise((resolveResult) => {
    const timer = setTimeout(() => resolveResult({ timedOut: true }), milliseconds);
    promise.then((value) => {
      clearTimeout(timer);
      resolveResult({ timedOut: false, value });
    });
  });
}

function terminateOwnedProcess(child) {
  if (process.platform === "win32" && child.pid) {
    // Kill only this smoke-owned shell process tree if its deadline expires.
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8", timeout: cleanupGraceMs, windowsHide: true,
    });
  } else {
    child.kill("SIGKILL");
  }
}

async function runChild(executable, args, { cwd = fixtureDir, env = isolatedEnv(undefined), input = "" } = {}) {
  let spawnError = null;
  let inputError = null;
  let stdout = "";
  let stderr = "";
  let resolveClosed;
  const closed = new Promise((resolveClose) => { resolveClosed = resolveClose; });
  let closeResult = null;
  const child = spawn(executable, args, {
    cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => { spawnError = error.message; });
  child.stdin.on("error", (error) => { inputError = error.message; });
  child.once("close", (exitCode, signal) => {
    closeResult = { exit_code: exitCode, signal };
    resolveClosed(closeResult);
  });
  child.stdin.end(input);

  const firstWait = await waitFor(closed, timeoutMs);
  let timedOut = firstWait.timedOut;
  let cleanupFinished = !timedOut;
  if (timedOut) {
    const cleanupStartedAt = Date.now();
    terminateOwnedProcess(child);
    const remainingGraceMs = Math.max(0, cleanupGraceMs - (Date.now() - cleanupStartedAt));
    const cleanupWait = await waitFor(closed, remainingGraceMs);
    cleanupFinished = !cleanupWait.timedOut;
  }

  return {
    executable,
    args,
    cwd,
    input,
    exit_code: closeResult?.exit_code ?? null,
    signal: closeResult?.signal ?? null,
    timed_out: timedOut,
    cleanup_finished: cleanupFinished,
    spawn_error: spawnError,
    input_error: inputError,
    stdout,
    stderr,
    fullOutput: `${stdout}${stderr}`,
  };
}

function extractDoctorResult(output) {
  for (let start = output.indexOf("{"); start >= 0; start = output.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < output.length; index += 1) {
      const char = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const value = JSON.parse(output.slice(start, index + 1));
            if (Array.isArray(value?.checks) && value.checks.includes("auth_context")) return value;
          } catch {
            // Continue scanning subsequent JSON objects in bounded host output.
          }
          break;
        }
      }
    }
  }
  return null;
}

function rpcInput({ includePrompt = true } = {}) {
  const requests = [{ id: "commands", type: "get_commands" }];
  if (includePrompt) requests.push({ id: "doctor", type: "prompt", message: "/multica-doctor-check" });
  return `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`;
}

async function runRpc(token, { includePrompt = true } = {}) {
  const args = [piCli, "--offline", "--no-session", "--no-tools", "--no-extensions",
    "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-mcp",
    "-e", extensionPath, "--mode", "rpc"];
  const input = rpcInput({ includePrompt });
  const processResult = await runChild(process.execPath, args, { env: isolatedEnv(token), input });
  const responses = parseJsonLines(processResult.stdout);
  const doctorResult = extractDoctorResult(processResult.fullOutput);
  return { ...processResult, responses, doctorResult };
}

function boundEvidence(value, limit = 12_000) {
  if (value.length <= limit) return { output: value, truncated: false };
  return { output: `${value.slice(0, limit)}\n[truncated after assertions]`, truncated: true };
}

function countMatches(output, pattern) {
  const matcher = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, "")}g`);
  return [...output.matchAll(matcher)].length;
}

function makeCase(name, processes, assertions, extraEvidence = {}) {
  const unhandledCount = processes.reduce((total, item) => total + countMatches(item.fullOutput, UNHANDLED_ERROR_PATTERN), 0);
  const loadErrorCount = processes.reduce((total, item) => total + countMatches(item.fullOutput, EXTENSION_LOAD_ERROR_PATTERN), 0);
  const passed = assertions.every((item) => item.passed) && unhandledCount === 0 && loadErrorCount === 0
    && processes.every((item) => item.exit_code === 0 && !item.timed_out
      && item.spawn_error == null && item.input_error == null);
  return {
    name,
    command: "npm run smoke:pi",
    exit_code: processes.at(-1)?.exit_code ?? null,
    passed,
    assertions,
    _unhandled_error_count: unhandledCount,
    _extension_load_error_count: loadErrorCount,
    evidence: {
      command: "npm run smoke:pi",
      deadline_ms: timeoutMs,
      cleanup_grace_ms: cleanupGraceMs,
      processes: processes.map((item) => {
        const stdout = boundEvidence(item.stdout);
        const stderr = boundEvidence(item.stderr);
        return {
          executable: sanitizeText(item.executable),
          args: sanitizeValue(item.args),
          cwd: sanitizeText(item.cwd),
          stdin: sanitizeText(item.input),
          exit_code: item.exit_code,
          signal: item.signal,
          timed_out: item.timed_out,
          cleanup_finished: item.cleanup_finished,
          spawn_error: item.spawn_error,
          input_error: item.input_error,
          stdout: sanitizeText(stdout.output),
          stderr: sanitizeText(stderr.output),
          truncated: stdout.truncated || stderr.truncated,
        };
      }),
      ...sanitizeValue(extraEvidence),
    },
  };
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runHostShell() {
  if (process.platform === "win32") {
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const command = `& ${shellQuote(process.execPath)} ${shellQuote(piCli)} --no-extensions --version; exit $LASTEXITCODE`;
    const args = ["-NoProfile", "-NonInteractive", "-Command", command];
    return { ...(await runChild(shell, args)), shell, command };
  }
  const shellCommand = '"$1" "$2" --no-extensions --version';
  const args = ["-c", shellCommand, "pi-host-shell", process.execPath, piCli];
  return { ...(await runChild("/bin/sh", args)), shell: "/bin/sh", command: shellCommand };
}

try {
  const load = await runRpc(undefined, { includePrompt: false });
  const happy = await runRpc(smokeToken);
  const error = await runRpc(undefined);
  const firstReloadProcess = await runRpc(smokeToken);
  const secondReloadProcess = await runRpc(smokeToken);
  const shell = await runHostShell();

  const cases = [
    makeCase("extension_load", [load], behaviorAssertions("extension_load", { responses: load.responses })),
    makeCase("happy_path", [happy], behaviorAssertions("happy_path", {
      responses: happy.responses,
      doctorResult: happy.doctorResult,
      tokenLeak: happy.fullOutput.includes(smokeToken),
    })),
    makeCase("error_path", [error], behaviorAssertions("error_path", {
      responses: error.responses,
      doctorResult: error.doctorResult,
    })),
    makeCase("reload_cleanup", [firstReloadProcess, secondReloadProcess], behaviorAssertions("reload_cleanup", {
      firstProcess: firstReloadProcess,
      secondProcess: secondReloadProcess,
    })),
    makeCase("host_shell", [shell], behaviorAssertions("host_shell", {
      process: shell,
      shellOutput: shell.stdout,
      expectedVersion: sdkVersions["@earendil-works/pi-coding-agent"],
    }), { host_shell: shell.shell, command_line: shell.command }),
  ];

  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: sdkVersions,
    platform: process.platform,
    model_inference: "none; deterministic MULTICA_TOKEN presence/absence fixtures sent to the actual extension command",
    host_boundary: "The actual pinned Pi CLI loads and runs the extension; only Pi's RPC transport is driven with deterministic offline inputs. Provider/model inference, SDK modules, extension lifecycle and feature implementation are not mocked.",
    unhandled_errors: cases.reduce((total, item) => total + item._unhandled_error_count, 0),
    extension_load_errors: cases.reduce((total, item) => total + Math.max(item._extension_load_error_count,
      item.name === "extension_load" && !item.assertions.every((assertion) => assertion.passed) ? 1 : 0), 0),
    cases: cases.map(({ _unhandled_error_count, _extension_load_error_count, ...item }) => item),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    verification_contract: VERIFICATION_CONTRACT,
    platform: process.platform,
    cases: report.cases.map(({ name, passed, exit_code, assertions }) => ({
      name, passed, exit_code, assertions: assertions.map(({ id, passed: assertionPassed }) => ({ id, passed: assertionPassed })),
    })),
  }));
  if (report.cases.some((item) => !item.passed) || report.unhandled_errors !== 0 || report.extension_load_errors !== 0) {
    process.exitCode = 1;
  }
} finally {
  rmSync(agentDir, { recursive: true, force: true });
  rmSync(fixtureDir, { recursive: true, force: true });
}
