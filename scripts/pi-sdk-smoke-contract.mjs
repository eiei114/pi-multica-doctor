export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_VERSIONS = Object.freeze({
  "@earendil-works/pi-agent-core": "1.2.0",
  "@earendil-works/pi-ai": "1.2.0",
  "@earendil-works/pi-coding-agent": "1.2.0",
  "@earendil-works/pi-tui": "1.2.0",
});
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|(?:shutdown|dispos(?:e|al)).{0,40}(?:error|fail)|(?:error|fail).{0,40}(?:shutdown|dispos(?:e|al))/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function commandRegistration(responses) {
  const response = responses.find((item) =>
    item?.type === "response" && item.id === "commands" && item.command === "get_commands",
  );
  if (response?.success !== true || !Array.isArray(response.data?.commands)) return null;
  const command = response.data.commands.find((item) =>
    item?.name === "multica-doctor-check" && item.source === "extension",
  );
  if (!command) return null;
  return {
    name: command.name,
    description: command.description,
    source: command.source,
    sourceInfo: command.sourceInfo && {
      source: command.sourceInfo.source,
      scope: command.sourceInfo.scope,
      origin: command.sourceInfo.origin,
    },
  };
}

function doctorPromptResponse(responses) {
  return responses.find((item) =>
    item?.type === "response" && item.id === "doctor" && item.command === "prompt",
  ) ?? null;
}

function processClosed(process) {
  return process?.exit_code === 0 && process.timed_out !== true
    && process.spawn_error == null && process.input_error == null;
}

function shutdownObservation(process) {
  if (!process) return null;
  return {
    exit_code: process.exit_code,
    signal: process.signal,
    timed_out: process.timed_out,
    cleanup_finished: process.cleanup_finished,
    spawn_error: process.spawn_error,
    input_error: process.input_error,
    unhandled_error: UNHANDLED_ERROR_PATTERN.test(process.fullOutput ?? ""),
    extension_load_error: EXTENSION_LOAD_ERROR_PATTERN.test(process.fullOutput ?? ""),
  };
}

export function behaviorAssertions(name, { responses = [], doctorResult = null, process = null,
  firstProcess = null, secondProcess = null, shellOutput = "", expectedVersion = "1.2.0",
  tokenLeak = false } = {}) {
  if (name === "extension_load") {
    const registration = commandRegistration(responses);
    return [assertion("extension_registered", "Actual Pi RPC registers multica-doctor-check from this extension",
      registration, registration !== null)];
  }

  if (name === "happy_path") {
    const prompt = doctorPromptResponse(responses);
    const handled = prompt?.success === true && prompt.data?.disposition === "handled";
    const validResult = doctorResult?.pass === true && doctorResult.fail_count === 0
      && Array.isArray(doctorResult.checks) && doctorResult.checks.length === 5
      && Array.isArray(doctorResult.failures) && doctorResult.failures.length === 0;
    return [assertion("feature_response", "The real extension command handles RPC input and returns all five healthy checks without exposing the token",
      { prompt: prompt ?? null, result: doctorResult, tokenLeak }, handled && validResult && !tokenLeak)];
  }

  if (name === "error_path") {
    const prompt = doctorPromptResponse(responses);
    const handled = prompt?.success === true && prompt.data?.disposition === "handled";
    const failedAuth = doctorResult?.pass === false && doctorResult.fail_count === 1
      && doctorResult.failures?.[0]?.check === "auth_context"
      && /MULTICA_TOKEN: absent/.test(doctorResult.failures[0]?.detail ?? "");
    return [assertion("handled_error", "With MULTICA_TOKEN deliberately absent, the real command handles the prompt and reports one auth_context failure without throwing",
      { prompt: prompt ?? null, result: doctorResult }, handled && failedAuth)];
  }

  if (name === "reload_cleanup") {
    const registration = commandRegistration(secondProcess?.responses ?? []);
    const prompt = doctorPromptResponse(secondProcess?.responses ?? []);
    const handled = prompt?.success === true && prompt.data?.disposition === "handled";
    const validResult = secondProcess?.doctorResult?.pass === true
      && secondProcess.doctorResult.fail_count === 0
      && secondProcess.doctorResult.checks?.length === 5;
    return [
      assertion("reloaded_extension_registered", "A second actual Pi process re-registers multica-doctor-check",
        registration, registration !== null),
      assertion("reloaded_feature_response", "The second process handles the feature command and returns the healthy diagnostic response",
        { prompt: prompt ?? null, result: secondProcess?.doctorResult ?? null }, handled && validResult),
      assertion("clean_shutdown", "Both actual Pi processes exit zero within the deadline without timeout, spawn, unhandled, load, or shutdown errors",
        { first: shutdownObservation(firstProcess), second: shutdownObservation(secondProcess) },
        processClosed(firstProcess) && processClosed(secondProcess)
          && !UNHANDLED_ERROR_PATTERN.test(firstProcess?.fullOutput ?? "")
          && !UNHANDLED_ERROR_PATTERN.test(secondProcess?.fullOutput ?? "")
          && !EXTENSION_LOAD_ERROR_PATTERN.test(firstProcess?.fullOutput ?? "")
          && !EXTENSION_LOAD_ERROR_PATTERN.test(secondProcess?.fullOutput ?? "")),
    ];
  }

  if (name === "host_shell") {
    const actualOutput = shellOutput.trim();
    return [assertion("native_shell_boundary", "The native host shell launches the locally pinned Pi CLI and prints exactly its installed SDK version",
      { exit_code: process?.exit_code ?? null, timed_out: process?.timed_out ?? false,
        stdout: actualOutput, stderr: process?.stderr ?? "", expectedVersion },
      processClosed(process) && actualOutput === expectedVersion && !(process?.stderr ?? "").trim())];
  }

  throw new Error(`Unknown smoke case: ${name}`);
}
