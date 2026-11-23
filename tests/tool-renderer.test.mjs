import assert from "node:assert/strict";
import test from "node:test";
import register from "../extensions/index.ts";

let tool;
register({ registerCommand() {}, registerTool(definition) { tool = definition; } });
const theme = { fg: (_color, text) => text, bold: (text) => text };
const result = { details: { pass: false, fail_count: 1, checks: ["auth_context"] } };

for (const [name, makeComponent, expected] of [
  ["call", () => tool.renderCall({}, theme, {}), ["multica_doctor_check"]],
  ["collapsed result", () => tool.renderResult(result, { expanded: false }, theme, {}),
    ["→ fail (1 failure(s))"]],
  ["expanded result", () => tool.renderResult(result, { expanded: true }, theme, {}),
    ["→ fail (1 failure(s))", "checks: auth_context"]],
]) {
  test(`${name} renderer returns mutable lines without exposing the Text cache`, () => {
    const component = makeComponent();
    const lines = component.render(40);
    assert.deepEqual(lines.map((line) => line.trimEnd()), expected);
    lines.splice(0, 1, "host-owned edit");
    assert.deepEqual(component.render(40).map((line) => line.trimEnd()), expected);
    component.invalidate();
    assert.deepEqual(component.render(40).map((line) => line.trimEnd()), expected);
  });
}
