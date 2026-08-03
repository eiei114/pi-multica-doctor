# pi-multica-doctor

> Multica workspace health, one command.

`pi-multica-doctor` is a Pi extension that runs read-only Multica workspace diagnostics in a single compact JSON report. It checks auth context, CLI syntax drift, registry table integrity, feedback JSONL well-formedness, and stuck in-progress runs.

This repository currently ships a **walking skeleton**: the `multica_doctor_check` tool and CLI return a static JSON contract with all five probes stubbed as `pass`. Real probe logic lands in later build slices.

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

### CLI

```bash
npx multica-doctor-check
```

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
