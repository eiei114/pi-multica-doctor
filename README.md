# pi-multica-doctor

> Multica workspace health, one command.

`pi-multica-doctor` is a Pi extension that reports read-only Multica workspace diagnostics as JSON. It currently runs two real probes: `auth_context` and `feedback_jsonl`.

## Install

```bash
pi install npm:pi-multica-doctor
```

Install into the current project:

```bash
pi install npm:pi-multica-doctor -l
```

## Usage

### Pi slash command

```txt
/multica-doctor-check
```

### Pi tool

Agents can call `multica_doctor_check` directly. The tool returns JSON like:

```json
{
  "checks": [
    "auth_context",
    "cli_syntax",
    "registry_tables",
    "feedback_jsonl",
    "stuck_runs"
  ],
  "pass": true,
  "fail_count": 0,
  "failures": []
}
```

The `checks` array lists the fixed set of check names, not which diagnostics actually ran. In this example, `pass: true` means no failures were reported; it does not mean all five diagnostics ran.

- **`auth_context`** checks that `MULTICA_TOKEN` is nonempty and that `.multica/daemon_task_context.json` is absent from the current working directory. It does not validate the token with Multica.
- **`feedback_jsonl`** parses each nonblank line of the `.jsonl` files directly in `4_Project/Multica-Agent-Strategy/Data/feedback-events/`. The probe looks for that path under `OBSIDIAN_VAULT_ROOT` if the variable is set, or under the current working directory if it is unset. It does not fall back to the working directory if the configured path is missing. A missing or unreadable directory, unreadable file, or invalid JSON line fails the probe; an existing directory with no `.jsonl` files passes.
- **`cli_syntax`, `registry_tables`, and `stuck_runs`** are placeholders that report pass without checking CLI syntax, registry tables, or stuck runs.

### CLI

```bash
npx multica-doctor-check
```

If Node refuses to load the installed package's TypeScript under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), run `node ./bin/multica-doctor-check.js` from a source checkout instead. Set `OBSIDIAN_VAULT_ROOT` if the checkout isn't the vault root.

When the CLI runs, it writes the JSON report to stdout whether the checks pass or fail. It exits with status `0` when `pass` is `true` and `1` when `pass` is `false`. On failure, see `fail_count` and `failures` in the report. A startup error may exit without a report.

## Development

```bash
npm install
npm run ci
pi -e .
```

## Scope

- Read-only diagnostics only
- No secret handling beyond token presence checks (implemented in slice 02)
- No auto-repair or status mutations
- Designed to delegate to upstream `multica doctor` when it ships

## Related docs

- Vault PRD: `4_Project/OSS/pi-multica-doctor/Docs/PRD.md`
- Incubator decision: `4_Project/Multica-Agent-Strategy/Incubations/2026-W27-pi-multica-doctor/DECISION.md`

## License

MIT
